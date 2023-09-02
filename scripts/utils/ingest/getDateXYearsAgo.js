// This util provides a way to return the date to obtain sec fillings using the sec-api x years ago

function getDateXYearsAgo(yearsAgo) {
  const currentDate = new Date();
  const endYear = currentDate.getFullYear();
  const startYear = endYear - yearsAgo;
  
  const startDate = new Date(startYear, 0, 1);
  const endDate = currentDate;

  const formattedStartDate = startDate.toISOString().slice(0, 10);
  const formattedEndDate = endDate.toISOString().slice(0, 10);
  
  return `${formattedStartDate} TO ${formattedEndDate}`;
}

module.exports = {
  getDateXYearsAgo,
}
