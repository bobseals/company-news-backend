# app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import os
from dotenv import load_dotenv
from datetime import datetime

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# API Keys
NEWS_API_KEY = os.getenv('NEWS_API_KEY')
ALPHA_VANTAGE_KEY = os.getenv('ALPHA_VANTAGE_KEY')

@app.route('/')
def health_check():
    return jsonify({"message": "Company News API Server is running!"})

@app.route('/api/company-news/<company_name>')
def get_company_news(company_name):
    try:
        if not NEWS_API_KEY:
            return jsonify({"error": "NEWS_API_KEY not configured"}), 500
        
        # Fetch news from NewsAPI
        url = "https://newsapi.org/v2/everything"
        params = {
            'q': f'"{company_name}"',
            'sortBy': 'publishedAt',
            'pageSize': 10,
            'apiKey': NEWS_API_KEY
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Format the response
        formatted_news = []
        for article in data.get('articles', []):
            formatted_news.append({
                'title': article.get('title', ''),
                'source': article.get('source', {}).get('name', ''),
                'date': article.get('publishedAt', '').split('T')[0],
                'summary': article.get('description', 'No summary available'),
                'url': article.get('url', ''),
                'imageUrl': article.get('urlToImage')
            })
        
        return jsonify({
            'companyName': company_name,
            'totalResults': data.get('totalResults', 0),
            'news': formatted_news
        })
        
    except requests.exceptions.RequestException as e:
        return jsonify({
            'error': 'Failed to fetch company news',
            'details': str(e)
        }), 500

@app.route('/api/company-info/<symbol>')
def get_company_info(symbol):
    try:
        if not ALPHA_VANTAGE_KEY:
            return jsonify({"error": "ALPHA_VANTAGE_KEY not configured"}), 500
        
        # Fetch company overview
        url = "https://www.alphavantage.co/query"
        params = {
            'function': 'OVERVIEW',
            'symbol': symbol.upper(),
            'apikey': ALPHA_VANTAGE_KEY
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Check for API limits or invalid symbol
        if 'Note' in data or not data.get('Name'):
            return jsonify({
                'error': 'API rate limit reached or invalid symbol',
                'suggestion': 'Try again in a minute or check the stock symbol'
            }), 429
        
        # Format company info
        company_info = {
            'name': data.get('Name', ''),
            'symbol': data.get('Symbol', ''),
            'sector': data.get('Sector', ''),
            'industry': data.get('Industry', ''),
            'marketCap': data.get('MarketCapitalization', ''),
            'description': data.get('Description', ''),
            'annualReport': {
                'year': "2023",
                'title': f"{data.get('Name', symbol)} Annual Report 2023",
                'url': f"https://www.sec.gov/edgar/search/#/q={symbol}&dateRange=custom&category=form&forms=10-K",
                'type': "SEC 10-K Filing"
            } if data.get('Symbol') else None
        }
        
        return jsonify(company_info)
        
    except requests.exceptions.RequestException as e:
        return jsonify({
            'error': 'Failed to fetch company information',
            'details': str(e)
        }), 500

@app.route('/api/search-symbol/<company_name>')
def search_symbol(company_name):
    try:
        if not ALPHA_VANTAGE_KEY:
            return jsonify({"error": "ALPHA_VANTAGE_KEY not configured"}), 500
        
        # Search for company symbol
        url = "https://www.alphavantage.co/query"
        params = {
            'function': 'SYMBOL_SEARCH',
            'keywords': company_name,
            'apikey': ALPHA_VANTAGE_KEY
        }
        
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        matches = data.get('bestMatches', [])
        top_match = matches[0] if matches else None
        
        if top_match:
            return jsonify({
                'symbol': top_match.get('1. symbol', ''),
                'name': top_match.get('2. name', ''),
                'type': top_match.get('3. type', ''),
                'region': top_match.get('4. region', ''),
                'currency': top_match.get('8. currency', '')
            })
        else:
            return jsonify({
                'symbol': None, 
                'message': 'No matching stock symbol found'
            })
        
    except requests.exceptions.RequestException as e:
        return jsonify({
            'error': 'Failed to search for stock symbol',
            'details': str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    print(f"🚀 Server running on http://localhost:{port}")
    print(f"📊 Company News API ready!")
    
    if not NEWS_API_KEY:
        print("⚠️  Warning: NEWS_API_KEY not found in environment variables")
    if not ALPHA_VANTAGE_KEY:
        print("⚠️  Warning: ALPHA_VANTAGE_KEY not found in environment variables")
    
    app.run(debug=True, host='0.0.0.0', port=port)