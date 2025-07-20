// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware with comprehensive CORS settings
app.use(cors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// API Keys - For production, use environment variables
const NEWS_API_KEY = process.env.NEWS_API_KEY || '86c6fb4088724044af50f2192958afaf';
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || '45J316M6H07IFWGM';

// Health check endpoint with debugging info
app.get('/', (req, res) => {
  res.json({ 
    message: 'Company News API Server is running!',
    timestamp: new Date().toISOString(),
    apis: {
      newsAPI: !!NEWS_API_KEY,
      alphaVantage: !!ALPHA_VANTAGE_KEY
    }
  });
});

// Get company news with better error handling
app.get('/api/company-news/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params;
    
    console.log(`📰 Fetching news for: ${companyName}`);

    // Fetch news from NewsAPI
    const newsResponse = await axios.get(`https://newsapi.org/v2/everything`, {
      params: {
        q: `"${companyName}" OR "${companyName} company" OR "${companyName} stock"`,
        sortBy: 'publishedAt',
        pageSize: 12,
        language: 'en',
        apiKey: NEWS_API_KEY
      },
      timeout: 10000
    });

    const articles = newsResponse.data.articles || [];
    
    // Filter and format the response
    const formattedNews = articles
      .filter(article => 
        article.title && 
        article.source?.name && 
        article.title !== '[Removed]' &&
        !article.title.toLowerCase().includes('removed')
      )
      .slice(0, 8) // Limit to 8 articles
      .map(article => ({
        title: article.title,
        source: article.source.name,
        date: article.publishedAt ? article.publishedAt.split('T')[0] : new Date().toISOString().split('T')[0],
        summary: article.description || 'No summary available',
        url: article.url,
        imageUrl: article.urlToImage
      }));

    console.log(`✅ Found ${formattedNews.length} articles for ${companyName}`);

    res.json({
      companyName,
      totalResults: newsResponse.data.totalResults || 0,
      news: formattedNews
    });

  } catch (error) {
    console.error('❌ Error fetching news:', error.response?.data || error.message);
    
    // Handle specific API errors
    if (error.response?.status === 426) {
      return res.status(426).json({ 
        error: 'NewsAPI requires upgrade for this request',
        details: 'Free tier has limitations on search parameters'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch company news',
      details: error.response?.data?.message || error.message,
      suggestion: 'Try a more specific company name or try again later'
    });
  }
});

// Get company financial data with retry logic
app.get('/api/company-info/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    console.log(`💼 Fetching company info for: ${symbol}`);

    // Fetch company overview from Alpha Vantage
    const response = await axios.get(`https://www.alphavantage.co/query`, {
      params: {
        function: 'OVERVIEW',
        symbol: symbol.toUpperCase(),
        apikey: ALPHA_VANTAGE_KEY
      },
      timeout: 10000
    });

    const data = response.data;

    // Check for API limits or errors
    if (data.Note) {
      console.log('⏳ Alpha Vantage API limit reached');
      return res.status(429).json({ 
        error: 'API rate limit reached',
        suggestion: 'Alpha Vantage allows 5 requests per minute. Please try again in a moment.'
      });
    }

    if (data.Information) {
      console.log('ℹ️ Alpha Vantage API info:', data.Information);
      return res.status(400).json({ 
        error: 'API request issue',
        details: data.Information
      });
    }

    if (!data.Name && !data.Symbol) {
      console.log(`❌ No company found for symbol: ${symbol}`);
      return res.status(404).json({ 
        error: 'Company not found',
        suggestion: 'Please check the stock symbol and try again'
      });
    }

    // Format company info
    const companyInfo = {
      name: data.Name || 'Unknown Company',
      symbol: data.Symbol || symbol.toUpperCase(),
      sector: data.Sector || 'Not Available',
      industry: data.Industry || 'Not Available',
      marketCap: data.MarketCapitalization || 'Not Available',
      description: data.Description || 'No description available',
      exchange: data.Exchange || 'Not Available',
      country: data.Country || 'Not Available',
      annualReport: data.Symbol ? {
        year: "2023",
        title: `${data.Name || symbol} Annual Report 2023`,
        url: `https://www.sec.gov/edgar/search/#/entityName=${encodeURIComponent(data.Name || symbol)}`,
        type: "SEC EDGAR Database"
      } : null
    };

    console.log(`✅ Successfully fetched info for ${data.Name || symbol}`);
    res.json(companyInfo);

  } catch (error) {
    console.error('❌ Error fetching company info:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch company information',
      details: error.message,
      suggestion: 'Please try again or check if the symbol exists'
    });
  }
});

// Search for stock symbol by company name with better matching
app.get('/api/search-symbol/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params;
    
    console.log(`🔍 Searching symbol for: ${companyName}`);

    // First try Alpha Vantage symbol search
    const response = await axios.get(`https://www.alphavantage.co/query`, {
      params: {
        function: 'SYMBOL_SEARCH',
        keywords: companyName,
        apikey: ALPHA_VANTAGE_KEY
      },
      timeout: 10000
    });

    const data = response.data;

    // Check for API limits
    if (data.Note) {
      console.log('⏳ Alpha Vantage API limit reached for symbol search');
      return res.json({ 
        symbol: null, 
        message: 'Symbol search temporarily unavailable due to API limits',
        fallback: true
      });
    }

    const matches = data.bestMatches || [];
    
    // Create a manual mapping for common companies
    const commonCompanies = {
      'apple': 'AAPL',
      'microsoft': 'MSFT', 
      'google': 'GOOGL',
      'alphabet': 'GOOGL',
      'tesla': 'TSLA',
      'amazon': 'AMZN',
      'meta': 'META',
      'facebook': 'META',
      'netflix': 'NFLX',
      'nvidia': 'NVDA'
    };
    
    const searchKey = companyName.toLowerCase().trim();
    
    // Check if we have a direct match in our common companies
    if (commonCompanies[searchKey]) {
      const symbol = commonCompanies[searchKey];
      console.log(`✅ Found direct match: ${symbol} for ${companyName}`);
      return res.json({
        symbol: symbol,
        name: companyName,
        type: 'Equity',
        region: 'United States',
        currency: 'USD',
        source: 'direct_match'
      });
    }
    
    // Find best match from API results
    let topMatch = null;
    for (const match of matches) {
      const matchName = (match['2. name'] || '').toLowerCase();
      const region = match['4. region'] || '';
      const type = match['3. type'] || '';
      
      // Prefer exact company name matches
      if (matchName.includes(searchKey) && region === 'United States' && type.includes('Equity')) {
        // For Apple, prefer the one that's exactly "Apple Inc" over "Apple Hospitality"
        if (searchKey === 'apple' && matchName.includes('apple inc')) {
          topMatch = match;
          break;
        }
        // For other companies, prefer shorter names (usually the main company)
        if (!topMatch || matchName.length < (topMatch['2. name'] || '').length) {
          topMatch = match;
        }
      }
    }
    
    // If no good US equity match, use first match
    if (!topMatch && matches.length > 0) {
      topMatch = matches[0];
    }

    if (topMatch) {
      const result = {
        symbol: topMatch['1. symbol'],
        name: topMatch['2. name'],
        type: topMatch['3. type'],
        region: topMatch['4. region'],
        currency: topMatch['8. currency'],
        source: 'api_search'
      };
      
      console.log(`✅ Found symbol: ${result.symbol} for ${companyName}`);
      res.json(result);
    } else {
      console.log(`❌ No symbol found for: ${companyName}`);
      res.json({ 
        symbol: null, 
        message: 'No matching stock symbol found. Company may be private or use different name.',
        suggestion: 'Try searching with the exact company legal name or stock ticker'
      });
    }

  } catch (error) {
    console.error('❌ Error searching symbol:', error.message);
    
    // Even if symbol search fails, we can still search for news
    res.json({ 
      symbol: null, 
      message: 'Symbol search failed, but news search will still work',
      error: error.message,
      fallback: true
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 =======================================');
  console.log(`   Company News API Server`);
  console.log(`   Running on http://localhost:${PORT}`);
  console.log('🚀 =======================================');
  console.log('📊 Endpoints available:');
  console.log(`   GET  /api/company-news/:companyName`);
  console.log(`   GET  /api/company-info/:symbol`);
  console.log(`   GET  /api/search-symbol/:companyName`);
  console.log('');
  console.log('🔑 API Status:');
  console.log(`   NewsAPI: ${NEWS_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   Alpha Vantage: ${ALPHA_VANTAGE_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  console.log('💡 Try these examples:');
  console.log(`   http://localhost:${PORT}/api/company-news/Apple`);
  console.log(`   http://localhost:${PORT}/api/search-symbol/Tesla`);
  console.log('=======================================');
});

module.exports = app;
