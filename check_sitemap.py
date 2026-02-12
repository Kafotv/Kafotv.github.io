import xml.etree.ElementTree as ET
import os

def check_sitemap(filename):
    print(f"Checking {filename}...")
    
    # Check for BOM
    with open(filename, 'rb') as f:
        first_bytes = f.read(3)
        if first_bytes == b'\xef\xbb\xbf':
            print("Found UTF-8 BOM - This can cause issues with some parsers.")
        else:
            print("No UTF-8 BOM found.")

    # Validate XML
    try:
        tree = ET.parse(filename)
        root = tree.getroot()
        print(f"XML is valid. Root tag: {root.tag}")
        
        # Check URLs
        for url in root.findall('{http://www.sitemaps.org/schemas/sitemap/0.9}url'):
            loc = url.find('{http://www.sitemaps.org/schemas/sitemap/0.9}loc').text
            print(f"  Found URL: {loc}")
            
    except Exception as e:
        print(f"XML Validation Error: {e}")

if __name__ == "__main__":
    check_sitemap("sitemap.xml")
