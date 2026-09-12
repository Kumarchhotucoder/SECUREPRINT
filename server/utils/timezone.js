/**
 * Accurate Asia/Kolkata (IST = UTC+05:30) Date Range Utilities.
 * 
 * SecurePrint operational days reset at 00:00:00 IST every day.
 * Historical database records are preserved permanently;
 * only the operational counters filter by the current IST day.
 */

function getTodayRangeIST(referenceDate = new Date()) {
  // IST offset is UTC+5 hours 30 mins = 330 minutes
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  // Convert referenceDate to IST local representation
  const istTime = new Date(referenceDate.getTime() + IST_OFFSET_MS);

  const year = istTime.getUTCFullYear();
  const month = istTime.getUTCMonth(); // 0-indexed
  const date = istTime.getUTCDate();

  // Start of day in IST (00:00:00.000 IST converted back to UTC)
  const startOfDayIST = new Date(Date.UTC(year, month, date, 0, 0, 0, 0) - IST_OFFSET_MS);

  // End of day in IST (23:59:59.999 IST converted back to UTC)
  const endOfDayIST = new Date(Date.UTC(year, month, date, 23, 59, 59, 999) - IST_OFFSET_MS);

  return {
    startOfDayIST,
    endOfDayIST,
    formattedDateIST: istTime.toISOString().split('T')[0]
  };
}

module.exports = {
  getTodayRangeIST
};
