/**
 * Price calculator for print jobs.
 * Uses shop's configured pricing if available, otherwise platform defaults.
 */

const DEFAULTS = {
  bwPerPage: 1,    // ₹1 per B&W page
  colorPerPage: 5  // ₹5 per color page
};

/**
 * Calculate estimated price for a print job.
 */
const calculatePrice = ({ totalPages, colorMode, copies, duplex, pagesPerSheet, shopPricing }) => {
  const pricing = shopPricing || DEFAULTS;

  // Effective pages to print (duplex halves physical sheets but same content)
  // Price is based on content pages × copies
  const contentPages = totalPages;
  const totalContentPages = contentPages * (copies || 1);

  const perPage = colorMode === 'COLOR' ? pricing.colorPerPage : pricing.bwPerPage;

  // pagesPerSheet reduces cost proportionally
  const sheetFactor = 1 / (pagesPerSheet || 1);

  const price = Math.ceil(totalContentPages * perPage * sheetFactor);

  return {
    totalContentPages,
    pricePerPage: perPage,
    estimatedPrice: price,
    currency: pricing.currency || 'INR'
  };
};

module.exports = { calculatePrice };
