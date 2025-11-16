import requests
import json
from bs4 import BeautifulSoup
import sys
import re # Import regex for status parsing

# --- CONFIGURATION ---
BASE_URL = 'https://samanwaya.kite.kerala.gov.in/index.php/Publicview/'
OUTPUT_FILE = 'roster_data.json' # This will be saved in the same folder
# --- END CONFIGURATION ---


def parse_verf_status(status_string):
    """
    Converts '59 / 67 Schools are Verified By Office' to [59, 67].
    Returns [0, 0] on failure or "N/A".
    """
    if status_string == "N/A":
        return [0, 0]
    
    # Use regex to find the first two numbers
    matches = re.findall(r'\d+', status_string)
    
    try:
        if len(matches) >= 2:
            num1 = int(matches[0])
            num2 = int(matches[1])
            return [num1, num2]
        else:
            return [0, 0] # Failed to find two numbers
    except (ValueError, IndexError, AttributeError):
        # Catch any error during parsing
        return [0, 0]

def parse_category_row(cols):
    """
    Parses a single table row (list of <td> elements) and extracts
    data based on the specific column indices.
    """
    try:
        return {
            "appo_2017": int(cols[2].text.strip() or 0),
            "appo_after_2017": int(cols[4].text.strip() or 0),
            "manager_appo": int(cols[7].text.strip() or 0),
            "not_approved": int(cols[9].text.strip() or 0),
            "not_appointed": int(cols[10].text.strip() or 0),
            "reported": int(cols[12].text.strip() or 0)
        }
    except (ValueError, IndexError) as e:
        print(f"      [PARSE ERROR] Could not parse row data: {e}. Row: {[c.text for c in cols]}")
        return None

def fetch_management_table(management_id):
    """
    Fetches the raw HTML for the report table.
    """
    url = f"{BASE_URL}getManagementList/{management_id}"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        print(f"      [HTTP ERROR] Failed to fetch table: {e}")
        return None

def parse_html_table(html_content, type_name, mgmt_name):
    """
    Parses the raw HTML table content into the required JSON structure.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    
    h4 = soup.find('h4', class_='box-title')
    if not h4:
        return None 
        
    verf_status_span = h4.find('span', class_='status-badge')
    status_string = verf_status_span.text.strip() if verf_status_span else "N/A"
    verf_status_list = parse_verf_status(status_string)
    
    data_entry = {
        "type_of_management": type_name,
        "name_of_management": mgmt_name,
        "verf_status": verf_status_list
    }

    table = soup.find('table', class_='table-bordered')
    if not table:
        return data_entry 

    rows = table.find('tbody').find_all('tr')
    
    for row in rows:
        cols = row.find_all('td')
        if not cols or len(cols) < 13 or cols[0].text.strip().isalpha():
            continue
        
        try:
            category_num = int(cols[0].text.strip())
            category_key = f"category_{category_num:02d}"
            
            category_data = parse_category_row(cols)
            
            if category_data:
                data_entry[category_key] = [category_data]
        except Exception as e:
            print(f"      [PARSE ERROR] Failed on row: {e}. Row: {[c.text for c in cols]}")

    return data_entry

def fetch_management_list(type_code, type_name):
    """
    Fetches the JSON list of all managements for a given type.
    """
    print(f"\n--- Fetching management list for type: {type_name} ({type_code}) ---")
    url = f"{BASE_URL}getRosterData/{type_code}"
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        managements = response.json()
        print(f"  Found {len(managements)} managements.")
        return managements
    except requests.exceptions.RequestException as e:
        print(f"  [CRITICAL ERROR] Failed to fetch management list: {e}")
        return []
    except json.JSONDecodeError:
        print(f"  [CRITICAL ERROR] Failed to parse JSON response from {url}")
        return []

def scrape_all_data():
    """
    Main function to run the scraper.
    """
    all_data = []
    skipped_items = []
    management_types = [
        {"code": "C", "name": "Corporate"},
        {"code": "I", "name": "Individual"}
    ]

    total_progress = 0
    
    for m_type in management_types:
        type_code = m_type["code"]
        type_name = m_type["name"]
        
        managements = fetch_management_list(type_code, type_name)
        if not managements:
            continue

        for i, mgmt in enumerate(managements):
            total_progress += 1
            mgmt_id = mgmt.get('id')
            mgmt_name = f"{mgmt.get('mngmnt_code')}-{mgmt.get('mngmnt_name')}"
            
            print(f"  ({i+1}/{len(managements)}) Scraping: {mgmt_name} (ID: {mgmt_id})", end="")
            sys.stdout.flush() 

            if not mgmt_id:
                print("\n      [SKIP] Management has no ID.")
                skipped_items.append(f"{type_name} - {mgmt_name} (No ID)")
                continue

            html_content = fetch_management_table(mgmt_id)
            if not html_content:
                print("\n      [SKIP] Failed to fetch HTML.")
                skipped_items.append(f"{type_name} - {mgmt_name}")
                continue
            
            parsed_data = parse_html_table(html_content, type_name, mgmt_name)
            if parsed_data:
                all_data.append(parsed_data)
                print(" ... Done")
            else:
                print("\n      [SKIP] No data found after parsing.")
                skipped_items.append(f"{type_name} - {mgmt_name} (No data)")
    
    print(f"\n--- Scraping Complete ---")
    if all_data:
        try:
            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(all_data, f, indent=4, ensure_ascii=False)
            print(f"Successfully saved {len(all_data)} entries to {OUTPUT_FILE}")
        except IOError as e:
            print(f"[ERROR] Failed to write to file {OUTPUT_FILE}: {e}")
    else:
        print("No data was successfully scraped.")

    if skipped_items:
        print(f"\n--- Skipped {len(skipped_items)} items (due to errors or no data) ---")
        for item in skipped_items:
            print(f"- {item}")

if __name__ == "__main__":
    scrape_all_data()
