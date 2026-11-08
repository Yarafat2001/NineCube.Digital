import subprocess

cmd = ["git", "log", "-n", "10", "--oneline", "--", "web/public/products/bd/fresh-mustard-oil-1l.jpg"]
res = subprocess.run(cmd, capture_output=True, text=True)
print("Git log for fresh-mustard-oil-1l.jpg:")
print(res.stdout)
