#!/usr/bin/env python3
"""
Fetch and consolidate curated models from Runware with API details and pricing.
Popular models are manually curated. Text-focused models are scraped from collections.
"""

import json
import os
import re
import requests
import uuid
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("RUNWARE_API_KEY")
if not API_KEY:
    raise ValueError("RUNWARE_API_KEY not found in .env file")

API_URL = "https://api.runware.ai/v1"
HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Load pricing data
def load_pricing_data():
    """Load pricing data from pricing.json if it exists."""
    pricing_file = os.path.join(os.path.dirname(__file__), "..", "src", "data", "pricing.json")
    if os.path.exists(pricing_file):
        with open(pricing_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Create lookup dict by model name (normalized)
            pricing = {}
            for model in data.get("models", []):
                name = model.get("name", "").lower().strip()
                pricing[name] = {
                    "price_usd": model.get("price_usd"),
                    "configuration": model.get("configuration"),
                    "discount": model.get("discount")
                }
            return pricing
    return {}

PRICING_DATA = load_pricing_data()

def match_pricing(model_name):
    """Try to match a model name to pricing data."""
    if not PRICING_DATA:
        return None
    
    name_lower = model_name.lower().strip()
    
    # Direct match
    if name_lower in PRICING_DATA:
        return PRICING_DATA[name_lower]
    
    # Try variations
    variations = [
        name_lower.replace('[', '').replace(']', ''),  # Remove brackets
        name_lower.replace('·', '').strip(),  # Remove middle dots
        name_lower.replace('-', ' '),  # Replace dashes with spaces
        name_lower.split('(')[0].strip(),  # Remove parentheses content
    ]
    
    for variant in variations:
        if variant in PRICING_DATA:
            return PRICING_DATA[variant]
    
    # Partial match - check if model name is contained in pricing name
    for price_name, price_data in PRICING_DATA.items():
        if name_lower in price_name or price_name in name_lower:
            # Check if it's a significant match (not just common words)
            name_words = set(name_lower.split())
            price_words = set(price_name.split())
            common_words = name_words & price_words
            # If more than 60% words match, consider it a match
            if len(common_words) >= min(len(name_words), len(price_words)) * 0.6:
                return price_data
    
    return None

# Popular models from https://runware.ai/models (manually curated for better API matching)
POPULAR_MODELS = [
    {"name": "ImagineArt 1.5 Pro", "creator": "ImagineArt"},
    {"name": "Qwen-Image-2512", "creator": "Alibaba"},
    {"name": "Seedream 4.5", "creator": "ByteDance"},
    {"name": "FLUX.2 [klein] 9B", "creator": "Black Forest Labs"},
    {"name": "FLUX.2 [klein] 4B", "creator": "Black Forest Labs"},
    {"name": "Kling IMAGE O1", "creator": "Kling AI"},
    {"name": "Nano Banana Pro", "creator": "Google"},
    {"name": "Z-Image-Turbo", "creator": "Alibaba"},
    {"name": "Qwen-Image-Edit-Plus", "creator": "Alibaba"},
    {"name": "FLUX.2 [dev]", "creator": "Black Forest Labs"},
    {"name": "Qwen-Image-Edit-2511", "creator": "Alibaba"},
    {"name": "Object Eraser", "creator": None},
    {"name": "Riverflow 2.0 Pro", "creator": "Sourceful"},
    {"name": "GPT Image 1.5", "creator": "OpenAI"},
    {"name": "Wan2.6 Image", "creator": "Alibaba"},
    {"name": "Midjourney V7", "creator": "Midjourney"},
    {"name": "ImagineArt 1.5", "creator": "ImagineArt"},
    {"name": "FLUX.2 [max]", "creator": "Black Forest Labs"},
    {"name": "Imagen 4 Preview", "creator": "Google"},
    {"name": "Imagen 4 Fast", "creator": "Google"},
    {"name": "Riverflow 2 Preview Max", "creator": "Sourceful"},
    {"name": "Riverflow 2 Preview Standard", "creator": "Sourceful"},
    {"name": "Midjourney V6", "creator": "Midjourney"},
    {"name": "Bria FIBO Edit", "creator": "Bria"},
]

# Collections to scrape (for text-focused models)
SCRAPE_COLLECTIONS = [
    {
        "name": "Best for Text on Images",
        "url": "https://runware.ai/collections/best-for-text-on-images",
        "output_file": "best_models.json"
    }
]


def scrape_collection_models(url):
    """
    Scrape models from a Runware collection page.
    Extracts model IDs and names from HTML.
    """
    try:
        print(f"  🌐 Fetching {url}...")
        
        # Use browser-like headers
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        html = response.text
        
        # Extract model cards with ID and name
        # Pattern: <a href="/models/MODEL_ID">...<h3...>MODEL_NAME</h3>
        models = []
        seen = set()
        
        # Find all model links
        link_pattern = r'<a href="/models/([^"]+)">'
        for model_id in re.findall(link_pattern, html):
            if model_id in seen:
                continue
            seen.add(model_id)
            
            # Try to find the model name near this link
            # Look for the model name in nearby content
            model_section_pattern = rf'<a href="/models/{re.escape(model_id)}">[^<]*(?:<[^>]+>[^<]*)*?<h3[^>]*>([^<]+)</h3>'
            name_match = re.search(model_section_pattern, html, re.DOTALL)
            
            if name_match:
                model_name = name_match.group(1).strip()
            else:
                # Fallback: convert model_id to a readable name
                model_name = model_id.replace('-', ' ').title()
            
            models.append({
                "model_id": model_id,
                "name": model_name,
                "air": None
            })
        
        if models:
            print(f"  ✓ Found {len(models)} unique models")
            return models
        
        print(f"  ✗ No models found in page")
        return []
        
    except Exception as e:
        print(f"  ✗ Error scraping {url}: {e}")
        return []

def search_model_details(model_name, creator=None, limit=20):
    """Search for a model by name and return its details including AIR."""
    try:
        # Try multiple search variations for better matching
        search_variations = [
            model_name,  # Original name
            model_name.replace('[', '').replace(']', ''),  # Remove brackets
            model_name.replace('‑', '-'),  # Normalize dashes
            model_name.split('(')[0].strip(),  # Remove parentheses content
        ]
        
        # Remove duplicates while preserving order
        search_terms = []
        for term in search_variations:
            if term and term not in search_terms:
                search_terms.append(term)
        
        best_match = None
        best_score = 0
        
        for search_term in search_terms:
            body = [
                {
                    "taskType": "modelSearch",
                    "taskUUID": str(uuid.uuid4()),
                    "search": search_term,
                    "limit": limit,
                    "offset": 0
                }
            ]
            
            resp = requests.post(API_URL, headers=HEADERS, json=body, timeout=30)
            if resp.status_code != 200:
                continue
                
            data = resp.json()
            if not data or "data" not in data or len(data["data"]) == 0:
                continue
                
            results = data["data"][0].get("results", [])
            
            # Score each result for match quality
            for result in results:
                result_name = result.get("name", "").lower()
                search_lower = search_term.lower()
                original_lower = model_name.lower()
                
                score = 0
                
                # Exact match - highest score
                if result_name == original_lower or result_name == search_lower:
                    score = 100
                # Contains full search term
                elif search_lower in result_name or result_name in search_lower:
                    score = 80
                # Partial word match
                else:
                    words = set(original_lower.replace('-', ' ').split())
                    result_words = set(result_name.replace('-', ' ').split())
                    common_words = words & result_words
                    if common_words:
                        score = len(common_words) * 20
                
                # Bonus if creator matches (if provided)
                if creator and score > 0:
                    # Check if creator appears in any field
                    result_str = str(result).lower()
                    if creator.lower() in result_str:
                        score += 10
                
                if score > best_score:
                    best_score = score
                    best_match = {
                        "air": result.get("air"),
                        "name": result.get("name"),
                        "category": result.get("category"),
                        "type": result.get("type"),
                        "architecture": result.get("architecture"),
                        "tags": result.get("tags", [])
                    }
                
                # If we have a perfect match, stop searching
                if score >= 100:
                    return best_match
        
        # Return best match if score is reasonable
        if best_match and best_score >= 40:
            return best_match
        
        return None
            
    except Exception as e:
        print(f"Error searching for {model_name}: {e}")
        return None

def enrich_models_by_name(models_list, list_name):
    """Enrich model list with API data and pricing using model names (better matching)."""
    enriched = []
    print(f"\n🔍 Fetching details for {list_name} ({len(models_list)} models)...")
    
    for i, model in enumerate(models_list, 1):
        model_name = model.get('name', '')
        print(f"  [{i}/{len(models_list)}] {model_name}... ", end="")
        
        # Search API by model name
        api_data = search_model_details(model_name, model.get('creator'))
        
        if api_data:
            enriched_model = {
                "name": model_name,
                "creator": model.get("creator"),
                "air": api_data.get("air"),
                "category": api_data.get("category"),
                "type": api_data.get("type"),
                "architecture": api_data.get("architecture"),
                "tags": api_data.get("tags", [])
            }
            
            # Try to add pricing
            pricing = match_pricing(model_name)
            if pricing:
                enriched_model["price_usd"] = pricing.get("price_usd")
                if pricing.get("configuration"):
                    enriched_model["price_configuration"] = pricing.get("configuration")
                if pricing.get("discount"):
                    enriched_model["price_discount"] = pricing.get("discount")
                print(f"✓ {api_data.get('air', 'N/A')} (${pricing.get('price_usd', 'N/A')})")
            else:
                print(f"✓ {api_data.get('air', 'N/A')}")
            
            enriched.append(enriched_model)
        else:
            # Skip models without AIR
            pricing = match_pricing(model_name)
            if pricing:
                print(f"✗ Skipped (no AIR, ${pricing.get('price_usd', 'N/A')})")
            else:
                print("✗ Skipped (no AIR)")
    
    return enriched

def enrich_models_by_id(models_list, list_name):
    """Enrich model list with API data and pricing using model IDs and names (from scraping)."""
    enriched = []
    print(f"\n🔍 Fetching details for {list_name} ({len(models_list)} models)...")
    
    for i, model in enumerate(models_list, 1):
        model_id = model.get('model_id', '')
        scraped_name = model.get('name', '')
        print(f"  [{i}/{len(models_list)}] {scraped_name}... ", end="")
        
        # Search API by model name first (better matching), fallback to model ID
        api_data = search_model_details(scraped_name) if scraped_name else None
        if not api_data:
            api_data = search_model_details(model_id)
        
        if api_data:
            enriched_model = {
                "model_id": model_id,
                "name": api_data.get("name") or scraped_name,
                "air": api_data.get("air"),
                "category": api_data.get("category"),
                "type": api_data.get("type"),
                "architecture": api_data.get("architecture"),
                "tags": api_data.get("tags", [])
            }
            
            # Try to add pricing
            pricing = match_pricing(api_data.get("name") or scraped_name)
            if pricing:
                enriched_model["price_usd"] = pricing.get("price_usd")
                if pricing.get("configuration"):
                    enriched_model["price_configuration"] = pricing.get("configuration")
                if pricing.get("discount"):
                    enriched_model["price_discount"] = pricing.get("discount")
                print(f"✓ {api_data.get('air', 'N/A')} (${pricing.get('price_usd', 'N/A')})")
            else:
                print(f"✓ {api_data.get('air', 'N/A')}")
            
            enriched.append(enriched_model)
        else:
            # Skip models without AIR
            pricing = match_pricing(scraped_name)
            if pricing:
                print(f"✗ Skipped (no AIR, ${pricing.get('price_usd', 'N/A')})")
            else:
                print("✗ Skipped (no AIR)")
    
    return enriched

if __name__ == "__main__":
    output_dir = os.path.join(os.path.dirname(__file__), "..", "src", "data")
    os.makedirs(output_dir, exist_ok=True)
    
    today = datetime.now().strftime("%Y-%m-%d")
    summary = []
    
    # Process manually curated popular models
    print(f"\n{'='*60}")
    print(f"📦 Popular Models (Manual List)")
    print(f"{'='*60}")
    
    popular_enriched = enrich_models_by_name(POPULAR_MODELS, "Popular Models")
    popular_output = {
        "source": "https://runware.ai/models",
        "collection": "Popular Models",
        "date_extracted": today,
        "total_models": len(popular_enriched),
        "models": popular_enriched
    }
    
    popular_path = os.path.join(output_dir, "popular_models.json")
    with open(popular_path, "w", encoding="utf-8") as f:
        json.dump(popular_output, f, indent=2, ensure_ascii=False)
    
    print(f"\n✓ Saved {len(popular_enriched)} models to {popular_path}")
    summary.append(f"   Popular Models: {len(popular_enriched)} models")
    
    # Process scraped collections
    for collection in SCRAPE_COLLECTIONS:
        print(f"\n{'='*60}")
        print(f"📦 {collection['name']} (Scraped)")
        print(f"{'='*60}")
        
        # Scrape models from the collection page
        models = scrape_collection_models(collection['url'])
        
        if not models:
            print(f"⚠️  No models found for {collection['name']}, skipping...")
            continue
        
        # Enrich with API data
        enriched = enrich_models_by_id(models, collection['name'])
        
        # Prepare output
        output_data = {
            "source": collection['url'],
            "collection": collection['name'],
            "date_extracted": today,
            "total_models": len(enriched),
            "models": enriched
        }
        
        # Save to file
        output_path = os.path.join(output_dir, collection['output_file'])
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        
        print(f"\n✓ Saved {len(enriched)} models to {output_path}")
        summary.append(f"   {collection['name']}: {len(enriched)} models")
    
    print(f"\n{'='*60}")
    print(f"📊 Summary:")
    print(f"{'='*60}")
    for line in summary:
        print(line)
    print()
