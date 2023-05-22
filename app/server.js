import express from 'express';
import next from 'next';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import session from 'express-session';
import passport from 'passport';
import LocalStrategy from 'passport-local';
import { body, validationResult } from 'express-validator';
import pgSession from 'connect-pg-simple';
import pkg from 'pg';
import bcrypt from 'bcrypt';
import { compare } from 'bcrypt';
const { Pool } = pkg;
import dotenv from 'dotenv';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';

dotenv.config();

// Instantiate the db connection 

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dev = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

app.use(express.json());

// Prevent CORS attacks for dev, staging and production

app.use(cors({
  origin: ['http://valumetrics.co', 'https://valumetrics.co', 'http://localhost:3000', 'https://valumetrics-demo.herokuapp.com/']
}));

// Set up rate-limit

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max number of requests allowed in the defined window
  message: 'Too many requests, please try again later.',
});

// Middleware

passport.use(
  new LocalStrategy(async (username, password, done) => {
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
        return done(null, username);
      } else {
        return done(null, false);
      }
    } catch (error) {
      return done(error);
    }
  })
);

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect('/auth');
  }
}

app.use(function (err, req, res, next) {
  console.error(err.stack);
  if (err.status === 404) {
    res.status(404).sendFile(path.join(__dirname, 'public/404.html'));
  } else {
    res.status(500).json({
      status: 'error',
      message: 'Something broke!',
    });
  }
});

// Serialize the user

passport.serializeUser((username, done) => {
  done(null, username);
})

// Deserialize the user

passport.deserializeUser(async (username, done) => {
  try {
    const query = 'SELECT * FROM users WHERE username = $1 LIMIT 1;';
    const values = [username];

    const result = await pool.query(query, values);
    const user = result.rows[0];

    if (user) {
      return done(null, username);
    } else {
      return done(new Error('Invalid username'));
    }
  } catch (error) {
    return done(error);
  }
});

app.use(express.urlencoded({ extended: true }));
// Session set up

// Production uncomment the below:

/*
const PgSession = pgSession(session);
const sessionStore = new PgSession({
  //pool,
  tableName: 'session',
});
*/

// Production -> store: sessionStore

app.use(session({ secret: process.env.SECRET_KEY, resave: false, saveUninitialized: false }));


// Set up Passport

app.use(passport.initialize());
app.use(passport.session());

nextApp.prepare().then(() => {
  // Serve static files from the public directory
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/app', ensureAuthenticated, (req, res) => {
    return nextApp.render(req, res, '/app', req.query);
  });

  app.get('/auth', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/auth.html'));
  });

  app.post('/auth', limiter, passport.authenticate('local', { failureRedirect: '/auth' }), (req, res) => {
    res.redirect('/app');
  });

  app.get('/sign-up', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/sign-up.html'));
  });

  // Sign-up auth + sanitisation

  app.post('/sign-up', [
    body('username').trim().isLength({ min: 1 }).escape(),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').trim().isLength({ min: 6 }).escape(),
  ], async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Invalid User data' });
        return;
      }
  
      const { username, email, password, confirm_password } = req.body;
      if (password !== confirm_password) {
        res.status(500);
        throw new Error("Passwords do not match");
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

  app.all('*', (req, res) => {
    return handle(req, res);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, function() {
    console.log('App is listening on port ' + port);
  });
  
})
