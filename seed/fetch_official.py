"""Probe official source availability. Refuse access when robots cannot be read."""
from urllib.robotparser import RobotFileParser
from common import fetch, USER_AGENT

def main():
    root = "https://waltonbd.com"
    data = fetch(root + "/robots.txt", "walton-robots.txt", "Walton", "Official factual data; no image/text reuse license")
    if data is None:
        print("Walton catalogue skipped: robots unavailable; no bypass attempted.")
        return
    robots = RobotFileParser()
    robots.parse(data.decode("utf-8").splitlines())
    url = root + "/mobile/smart-phone"
    if not robots.can_fetch(USER_AGENT, url):
        print("Walton catalogue skipped: robots disallows crawling.")
        return
    fetch(url, "walton-phones.html", "Walton", "Official factual data; no image/text reuse license")
    print("Official HTML is evidence only; no unreviewed HTML adapter imports products.")

if __name__ == "__main__":
    main()
