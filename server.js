const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { body, validationResult } = require('express-validator');
const pgSession = require('connect-pg-simple')(session);
const pg = require('pg');
const bcrypt = require('bcrypt');
const { compare } = require('bcrypt');
const dotenv = require('dotenv');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const pgParse = require('pg-connection-string');
const hbs = require('hbs');
const fetch = require('node-fetch');
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const yahooFinance = require('yahoo-finance');
const yahooFinance2 = require('yahoo-finance2').default;
const multer = require('multer');
const flash = require('connect-flash');
const { ingestDoc, makeChain, initPinecone } = require('./scripts/ingest');
const { PineconeStore } = require('langchain/vectorstores/pinecone');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');


dotenv.config();

// Instantiate the db connection
const config = pgParse.parse(process.env.DATABASE_URL);
config.ssl = {
  rejectUnauthorized: false
};
const pool = new pg.Pool(config);

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const dev = process.env.NODE_ENV !== 'production';

app.use(express.json());
app.use(flash());

// Prevent CORS attacks for dev, staging, and production

app.use(cors({
  origin: [
    'http://valumetrics.co',
    'https://valumetrics.co',
    'http://localhost:3000',
    'https://valumetrics-demo.herokuapp.com',
    'http://valumetrics.ai',
    'https://valumetrics.ai',
    'https://valumetrics.ai/google/callback',
    'https://valumetrics.ai/linkedin/callback',
    'https://accounts.google.com/'
  ],
  methods: 'GET, POST, PUT, DELETE',
  credentials: true,
}));

app.set('trust proxy', 1);

// Set up rate-limit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max number of requests allowed in the defined window
  message: 'Too many requests, please try again later.'
});

// Middleware
passport.use(new LocalStrategy(async (username, password, done) => {
  try {
    const query = 'SELECT * FROM users WHERE username = $1 LIMIT 1;';
    const values = [username];

    const result = await pool.query(query, values);
    const user = result.rows[0];

    if (!user) {
      return done(null, false);
    }

    const passwordMatch = await compare(password, user.password);

    if (passwordMatch) {
      return done(null, user); // Pass the entire user object
    } else {
      return done(null, false);
    }
  } catch (error) {
    console.error('Error in LocalStrategy:', error);
    return done(error);
  }
}));



// Setting up multer storage

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/docs');
  },
  filename: (req, file, cb) => {
    const company_id = req.body.company_id;
    const document_type = req.body.document_type;
    const year = req.body.year;
    const fileName = `${company_id}_${document_type}_${year}_${file.originalname}`;
    cb(null, fileName);
  }
});

// Create multer upload instance

const upload = multer({ storage });

// Setting up LinkedIn OAuth

passport.use(
  new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: "https://www.valumetrics.ai/linkedin/callback",
      scope: ["r_emailaddress", "r_liteprofile"],
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1';
        const result = await pool.query(query, [email]);
        if (result.rows.length === 0) {
          const insertQuery = 'INSERT INTO users (username, email) VALUES ($1, $2)';
          await pool.query(insertQuery, [email, email]);
        }
        done(null, profile);
      } catch (error) {
        done(error);
      }
    }
  )
);

// Google OAuth2.0 Set-Up

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://www.valumetrics.ai/google/callback",
  passReqToCallback: true,
  proxy: true,
},
function(request, accessToken, refreshToken, profile, done) {
  const email = profile.emails[0].value;
  pool.query('SELECT * FROM users WHERE email = $1 LIMIT 1', [email], (error, results) => {
    if (error) {
      done(error);
    } else if (results.rows.length === 0) {
      // This email isn't in our database, so create a new user
      pool.query('INSERT INTO users (username, email) VALUES ($1, $2)', [email, email], (error) => {
        if (error) {
          done(error);
        } else {
          done(null, email);
        }
      });
    } else {
      done(null, email);
    }
  });
}
));

// View engines

app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
hbs.registerHelper('get', function(object, key) {
  return object[key];
});

// Serialize the user
passport.serializeUser((user, done) => {
  if(user.password) { //Local strategy
    done(null, {id: user.id, username: user.username, email: user.email, is_admin: user.is_admin});
  } else { //OAuth Strategy
    done(null, user);
  }
});

// Deserialize the user

passport.deserializeUser(async (req, data, done) => {
  console.log('Deserializing user. Input data:', data);
  
  try {
    if (typeof data === 'string') {
      const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1;';
      const values = [data.toLowerCase().trim()];
      
      console.log('Executing query:', query, 'with values:', values);
      
      const result = await pool.query(query, values);
      
      console.log('Query result:', result);
      
      const user = result && result.rows && result.rows[0] ? result.rows[0] : null;
      
      if (user) {
        const deserializedUser = {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin
        };

        req.user = deserializedUser;
        
        console.log('Deserialized user:', deserializedUser);

        return done(null, deserializedUser);
      } else {
        return done(new Error('Invalid email'));
      }
    } else {
      if (!data || !data.emails || data.emails.length === 0) {
        return done(new Error('Invalid OAuth data'));
      }

      const email = data.emails[0].value;
      const username = data.displayName;
      const query = 'SELECT * FROM users WHERE email = $1 LIMIT 1;';
      
      console.log('Executing query:', query, 'with email:', email);

      const result = await pool.query(query, [email]);

      console.log('Query result:', result);
      
      if (result.rows.length === 0) {
        const insertQuery = 'INSERT INTO users (username, email) VALUES ($1, $2)';
        
        console.log('Inserting new user:', insertQuery, 'with username and email:', username, email);
        
        await pool.query(insertQuery, [username, email]);
      }

      const deserializedUser = {
        id: null,
        username: username,
        email: email,
        is_admin: false
      };

      req.user = deserializedUser;
      
      console.log('Deserialized user:', deserializedUser);

      return done(null, deserializedUser);
    }
  } catch (error) {
    console.error('Error in deserializeUser:', error);
    return done(error);
  }
});



// Session set up

const sessionStore = new pgSession({
  pool,
  tableName: 'session',
  errorLog: console.error
});

app.use(session({ 
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  proxy: true,
  cookie: {
    secure: "auto",
    maxAge: 100000000,
    sameSite: "none",
  }
  }));

// Set up Passport

app.use(passport.initialize());
app.use(passport.session());


const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect('/auth');
  }
};


const ensureAuthenticatedAdmin = (req, res, next) => {
  if (req.isAuthenticated() && req.user.is_admin) {
    req.user = req.session.passport.user;
    return next();
  } else {
    res.redirect('/auth');
  }
}

app.get('/app', ensureAuthenticated, async (req, res) => {
  let username = 'undefined';
  if (req.user.provider == 'linkedin') {
    username = req.user.displayName;
  } else {
    username = req.user.username;
  }

  // Obtaining number of users 

  const usersQuery = `SELECT COUNT(*) FROM users;`;
  const usersResult = await pool.query(usersQuery);
  const users = usersResult.rows[0].count;

  // Obtaining number of companies supported 

  const companiesQuery = `SELECT * FROM companies;`;
  const companiesResult = await pool.query(companiesQuery);
  const companies = companiesResult.rows[0].count;
  

  // Obtaining the number of documents

  const documentsQuery = `SELECT COUNT(*) FROM documents;`;
  const documentsResult = await pool.query(documentsQuery);
  const documents = documentsResult.rows[0].count;

  // Obtaining the number of documents per company

  const ids = {};
  companiesResult.rows.forEach(row => {
    ids[row.id] = 0;
  });

  for (id in ids) {
    const documentsPerIdQuery = `SELECT COUNT(*) FROM documents WHERE company_id=$1;`;
    const documentsPerIdResult = await pool.query(documentsPerIdQuery, [id]);
    const documentsPerCompany = documentsPerIdResult.rows[0].count;
    ids[id] = parseInt(documentsPerCompany);
  }
  
  res.render('app', { username: username, ids:ids });
})


app.get('/app/companies', ensureAuthenticated, async (req, res) => {
  const queryCompany = `SELECT * FROM companies;`;
  const results = await pool.query(queryCompany);
  const rows = results.rows;
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;

  const tickers = [];

  for (const row of rows) {
    const queryDocs = `SELECT COUNT(*) FROM documents WHERE company_id=$1;`;
    const value = [row.id];
    const resultDocs = await pool.query(queryDocs, value);

    const ticker = row.ticker;
    const name = row.name;
    const marketCap = row.market_cap;
    const logoUrl = row.logo_url;
    const docs = parseInt(resultDocs.rows[0].count);

    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${apiKey}`;
    try {
      const data = await fetch(url);
      const json = await data.json();
      if (json && json.Symbol && json.MarketCapitalization) {
        tickers.push({
          name,
          ticker: json.Symbol,
          marketCap: json.MarketCapitalization,
          logoUrl,
          docs,
        });
      } else {
        tickers.push({ name, ticker, marketCap, logoUrl, docs });
      }
    } catch (error) {
      console.log(`Error fetching ticker for ${ticker}: ${error}`);
      tickers.push({ name, ticker, marketCap, logoUrl, docs });
    }
  }
  res.render('companies', { tickers });
});

app.get('/app/company/:ticker', ensureAuthenticated, async (req, res) => {

  const ticker = req.params.ticker;

  
  // All data related to the chart
  
  const query = `SELECT * FROM companies WHERE ticker=$1`;
  const values = [ticker];

  // All data related to the docs 

  const docQuery = `SELECT * FROM documents WHERE company_id=$1;`;
  
  let company;
  let docData;
  try {
    const result = await pool.query(query, values);
    const docValues = [result.rows[0].id];
    const docResults = await pool.query(docQuery, docValues);
    docData = docResults.rows;
    if (result.rows.length == 0) { 
      return res.status(404).send('Stock not found in the database');
    }
    company = result.rows[0]; 
  } catch (err) {
    console.error('Failed to retrieve stock from the database:', err);
    return res.status(500).send(err.message);
  }
  
  try {
    const quotes = await yahooFinance.historical({
        symbol: ticker,
        from: '2023-01-01',
        to: '2023-05-26',
        period: 'd'
    });

    const stockData = quotes.map(quote => ({
        date: new Date(quote.date).toISOString().split('T')[0],
        price: quote.close
    }));

    // Passing in key ratios 
    let ratioData;
    try {
      ratioData = (await yahooFinance2.quoteSummary(ticker)).summaryDetail;
    } catch (err) {
      console.error('Error getting stock data');
      return res.status(500).send(err.message);
    }
    res.render('company', { stockData: JSON.stringify(stockData), company, data: ratioData, docData: docData }); // Pass company data to the template
  } catch (err) {
    console.error('Failed to retrieve stock price data:', err);
    res.status(500).send(err.message);
  }
});

app.post('/app/company/:ticker', ensureAuthenticated, async (req, res) => {
  const ticker = req.params.ticker;
  const question = req.body.question;
  console.log("Question: " + question);
  if (!question) {
    res.status(400).json({ error: "No question in the request" });
  }
  const sanitisedQuestion = question.trim().replaceAll('\n', ' ');

  try {
    const pinecone = await initPinecone();
    const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
    const vectorStore = await PineconeStore.fromExistingIndex(
      new OpenAIEmbeddings({}),
      {
        pineconeIndex: index,
        textKey: 'text',
      },
    );

    // Create the chain
    const chain = await makeChain(vectorStore);
    const response = await chain.call({
      question: sanitisedQuestion,
      chat_history: [],
    });

    // Retrieve the stock data using the ticker from the request
    const query = `SELECT * FROM companies WHERE ticker=$1`;
    const values = [ticker];

    let company;
    let docData;
    try {
      const result = await pool.query(query, values);
      if (result.rows.length == 0) {
        return res.status(404).send('Stock not found in the database');
      }
      company = result.rows[0];

      // Fetch the document data for the company
      const docQuery = `SELECT * FROM documents WHERE company_id=$1;`;
      const docValues = [company.id];
      const docResults = await pool.query(docQuery, docValues);
      docData = docResults.rows;
    } catch (err) {
      console.error('Failed to retrieve stock from the database:', err);
      return res.status(500).send(err.message);
    }

    try {
      const quotes = await yahooFinance.historical({
        symbol: ticker,
        from: '2023-01-01',
        to: '2023-05-26',
        period: 'd'
      });

      const stockData = quotes.map(quote => ({
        date: new Date(quote.date).toISOString().split('T')[0],
        price: quote.close
      }));

      // Passing in key ratios
      let ratioData;
      try {
        ratioData = (await yahooFinance2.quoteSummary(ticker)).summaryDetail;
      } catch (err) {
        console.error('Error getting stock data');
        return res.status(500).send(err.message);
      }

      res.render('company', {
        stockData: JSON.stringify(stockData),
        company,
        data: ratioData,
        response: {
          text: response.text,
          sourceDocuments: response.sourceDocuments,
        },
        docData: docData // Pass the document data to the template
      });
    } catch (err) {
      console.error('Failed to retrieve stock price data:', err);
      res.status(500).send(err.message);
    }
  } catch (error) {
    console.log(error, "Something went wrong in the route");
    console.log(error.message);
  }
});


app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/privacy-policy.html'));
})


app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/auth.html'));
});

app.post('/auth', limiter, passport.authenticate('local', { failureRedirect: '/auth' }), (req, res) => {
  req.login(req.user, function(err) {
    if (err) { return next(err); }
    return res.redirect('/app');
  });
});

app.get('/admin', ensureAuthenticatedAdmin ,async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies;');
    const tableData = result.rows;
    res.render('admin', { tableData });
  } catch (err) {
    console.error('Error fetching data from the database:', err);
    res.status(500).send('Internal Server Error');
  }
})

// POST Routes for /admin

app.post('/admin', ensureAuthenticatedAdmin ,upload.single('file'), [
  body('market_cap').customSanitizer((value) => value ? value.replace(/,/g, '') : ''),
], async (req, res) => {
  const formType = req.body.formType;
  if (formType === 'add-company') {
    try {
      const { name, ticker, market_cap, logo_url } = req.body;
      const query = `INSERT INTO companies (name, ticker, market_cap, logo_url) VALUES ($1, $2, $3, $4);`;
      const values = [name, ticker, market_cap, logo_url];
      const result = await pool.query(query, values);
      req.flash('success', 'Company added successfully');
      res.redirect(req.header('Referer') || '/');
    } catch (err) {
      console.error('Failed to add company to database:', err);
      req.flash('error', 'Failed to add company to database');
      res.redirect(req.header('Referer') || '/');
    }
  }

  if (formType === 'add-document') {
    try {
      const { company_id, document_type, year } = req.body;
      const file = req.file;
      if (!file) {
        req.flash('error', 'No file uploaded');
        res.redirect(req.header('Referer') || '/');
        return;
      }

      await ingestDoc(file, company_id, document_type, year);
      /*
      const fileName = `${company_id}_${document_type}_${year}_${file.originalname}`;
      const filePath = `docs/${company_id}/${year}/${fileName}`;
      const query = `INSERT INTO documents (company_id, document_type, file_name, file_path, file_size, upload_timestamp, year) VALUES ($1, $2, $3, $4, $5, $6, $7);`;
      const values = [company_id, document_type, fileName, filePath, file.size, new Date(), year];
      const result = await pool.query(query, values);
      const targetDir = `docs/${company_id}/${year}`;
      fs.mkdirSync(targetDir, { recursive: true });
      fs.renameSync(file.path, path.join(targetDir, fileName));
      */
      req.flash('success', 'Document added successfully');
      res.redirect(req.header('Referer') || '/');
    } catch (err) {
      console.error('Error adding document to the database:', err);
      req.flash('error', 'Error adding document to the database');
      res.redirect(req.header('Referer') || '/');
    }
  }
});


app.get('/sign-up', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/sign-up.html'));
});

// Sign-up auth + sanitization

app.post('/sign-up', [
  body('username').trim().isLength({ min: 1 }).escape(),
  body('email').trim().isEmail().normalizeEmail({ gmail_remove_dots: false }),
  body('password').trim().isLength({ min: 6 }).escape(),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ error: 'Invalid User data' });
      return;
    }

    const { username, email, password, confirm_password } = req.body;
    if (password !== confirm_password) {
      res.status(400).json({ error: 'Passwords do not match' });
      return;
    }

    // Check if the email already exists
    const emailQuery = 'SELECT * FROM users WHERE email = $1 LIMIT 1;';
    const emailResult = await pool.query(emailQuery, [email]);
    if (emailResult.rows.length > 0) {
      res.status(400).json({ error: 'Email already in use' });
      return;
    }

    const saltRounds = 7;
    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);

    const query = `INSERT INTO users (username, email, password) VALUES ($1, $2, $3);`;
    const values = [username, email, hash];

    await pool.query(query, values);

    res.redirect('/app');
  } catch (error) {
    next(error);
  }
});


// Oauth routes

// app.get('/google',
//   passport.authenticate('google', {
//           scope:
//               ['email', 'profile']
//       }
//   ));

app.get('/google',
  function(req, res, next) {
    next();
  },
  passport.authenticate('google', { 
    scope: ['email', 'profile'],
    failureFlash: true 
  }),
  function(req, res) {
  }
);



// app.get('/google/callback',
//   passport.authenticate('google', {
//       failureRedirect: '/auth',
//   }),
//   function (req, res) {
//     console.log("GOt to here whoop")
//     res.redirect('/app')

//   }
// );

app.get('/google/callback',
  function(req, res, next) {
    next();
  },
  passport.authenticate('google', { failureRedirect: '/auth', failureFlash: true }),
  function(req, res) {
    res.redirect('/app')
  }
);


app.get(
  "/linkedin",
  passport.authenticate("linkedin", { state: "SOME STATE" })
);


app.get(
  "/linkedin/callback",
  passport.authenticate("linkedin", {
    successRedirect: "/app",
    failureRedirect: "/auth",
  })
);


app.get('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        res.status(400).send('Unable to log out');
      } else {
        res.redirect('/');
      }
    });
  } else {
    res.end();
  }
});

// Error handling middleware should be placed after all routes
app.use(function(req, res, next) {
  res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
});

app.use(function (err, req, res, next) {
  console.error(err.stack);

  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Something broke!',
  });
});





const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log('App is listening on port ' + port);
});
