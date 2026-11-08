import os
import time
from playwright.sync_api import sync_playwright

artifacts_dir = r"C:\Users\yeasi\.gemini\antigravity\brain\c29260b8-4e39-4119-8fe7-84a12d0e5923"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        
        print("1. Opening catalogue on local dev server...")
        page.goto("http://localhost:5173/#/products", wait_until="networkidle")
        page.wait_for_timeout(2000)
        
        # Take full catalogue view
        page.screenshot(path=os.path.join(artifacts_dir, "live_catalogue_initial.png"))
        print("Captured live_catalogue_initial.png")
        
        # Check products displayed
        cards = page.locator(".product-card")
        card_count = cards.count()
        print(f"Rendered product cards: {card_count}")
        
        # Search for Rice / Bashundhara
        search_box = page.locator("input[type='search'], input[placeholder*='Search']").first
        if search_box.count() > 0:
            search_box.fill("Bashundhara")
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(artifacts_dir, "live_bashundhara_rice_packet.png"))
            print("Captured live_bashundhara_rice_packet.png")
            
            # Hover over first card to see animated transition to open view
            first_card = page.locator(".product-card").first
            if first_card.count() > 0:
                first_card.hover()
                page.wait_for_timeout(800)
                page.screenshot(path=os.path.join(artifacts_dir, "live_bashundhara_rice_hover_open.png"))
                print("Captured live_bashundhara_rice_hover_open.png")
                
                # Click the toggle button to test the mobile toggle
                toggle_btn = first_card.locator(".product-card__view-toggle")
                if toggle_btn.count() > 0:
                    toggle_btn.click()
                    page.wait_for_timeout(600)
                    page.screenshot(path=os.path.join(artifacts_dir, "live_bashundhara_rice_toggle_tapped.png"))
                    print("Captured live_bashundhara_rice_toggle_tapped.png")
                    
                # Click Add to Cart to see animated feedback
                add_btn = first_card.locator("button:has-text('Add to cart')")
                if add_btn.count() > 0:
                    add_btn.click()
                    page.wait_for_timeout(400)
                    page.screenshot(path=os.path.join(artifacts_dir, "live_bashundhara_rice_added_animation.png"))
                    print("Captured live_bashundhara_rice_added_animation.png")
                    
        # Search for Mustard Oil & Olive Oil
        search_box = page.locator("input[type='search'], input[placeholder*='Search']").first
        if search_box.count() > 0:
            search_box.fill("Mustard Oil")
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(artifacts_dir, "live_mustard_oil.png"))
            print("Captured live_mustard_oil.png")
            
            first_oil = page.locator(".product-card").first
            if first_oil.count() > 0:
                first_oil.hover()
                page.wait_for_timeout(800)
                page.screenshot(path=os.path.join(artifacts_dir, "live_mustard_oil_hover_open.png"))
                print("Captured live_mustard_oil_hover_open.png")
                
            search_box.fill("Olive Oil")
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(artifacts_dir, "live_olive_oil.png"))
            print("Captured live_olive_oil.png")
            
            search_box.fill("Anklet")
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(artifacts_dir, "live_anklet.png"))
            print("Captured live_anklet.png")
            
            search_box.fill("10 Minute School")
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(artifacts_dir, "live_10ms_courses.png"))
            print("Captured live_10ms_courses.png")

        browser.close()
        print("Done Playwright autonomous visual verification!")

if __name__ == "__main__":
    main()
