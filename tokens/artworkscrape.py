import os
import time
import requests

BASE_URL = "https://www.dnd5eapi.co"

def download_api_artwork(endpoint, output_dir):
    """
    Fetches items from a given endpoint (like /api/monsters or /api/classes),
    checks if they have an 'image' field, and downloads them.
    """
    os.makedirs(output_dir, exist_ok=True)
    list_url = f"{BASE_URL}{endpoint}"
    
    print(f"Fetching list from {list_url}...")
    response = requests.get(list_url)
    if response.status_code != 200:
        print(f"Failed to fetch list for {endpoint}")
        return

    items = response.json().get("results", [])
    print(f"Found {len(items)} items. Checking for artwork...")

    for item in items:
        # Fetch the details for each item (e.g., /api/monsters/aboleth)
        detail_url = f"{BASE_URL}{item['url']}"
        detail_response = requests.get(detail_url)
        
        if detail_response.status_code == 200:
            data = detail_response.json()
            image_relative_path = data.get("image")
            
            if image_relative_path:
                # Build the absolute URL to the image
                image_url = f"{BASE_URL}{image_relative_path}"
                filename = os.path.basename(image_relative_path)
                save_path = os.path.join(output_dir, filename)
                
                # Check if we already downloaded it to avoid duplicates
                if os.path.exists(save_path):
                    print(f"Skipping {filename} (already downloaded)")
                    continue
                
                print(f"Downloading {filename}...")
                img_data = requests.get(image_url).content
                with open(save_path, "wb") as f:
                    f.write(img_data)
                
                # A polite 0.2-second pause to not spam the server
                time.sleep(0.2)

if __name__ == "__main__":
    # Get all monster artwork
    download_api_artwork("/api/monsters", "dnd_monster_art")
    
    # Get all class artwork
    download_api_artwork("/api/classes", "dnd_class_art")
    
    print("Done! All available artwork has been saved.")