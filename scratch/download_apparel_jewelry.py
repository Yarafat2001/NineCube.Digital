import os
import subprocess

master_dir = r'C:\Users\yeasi\source\repos\NineCube.Digital\scratch\bd_master_photos'
os.makedirs(master_dir, exist_ok=True)

commons_targets = {
    'anklet_gold_open': 'https://upload.wikimedia.org/wikipedia/commons/6/60/Anklet_on_female_feet.jpg',
    'saree_jamdani_open': 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Jamdani_display_at_BSCIC_Jamdani_palli%2C_Narayanganj.jpg',
    'panjabi_embroidered_open': 'https://upload.wikimedia.org/wikipedia/commons/3/31/Kurta_traditional_front_sandalwood_buttons.jpg',
    'baby_winter_open': 'https://upload.wikimedia.org/wikipedia/commons/b/b9/Baby_Surprise_Jacket_-_2939907181.jpg',
    'bangles_gold_open': 'https://upload.wikimedia.org/wikipedia/commons/5/59/Gold_%26_Silver_Hairpins_%26_Bangles_%289889485666%29.jpg'
}

for tag, url in commons_targets.items():
    out_path = os.path.join(master_dir, f"{tag}.jpg")
    try:
        subprocess.run(['curl.exe', '-s', '-H', 'User-Agent: NineCubeBot/1.0', '--max-time', '15', url, '-o', out_path], check=True)
        print(f"[{tag}] OK: {os.path.getsize(out_path)} bytes")
    except Exception as e:
        print(f"[{tag}] Err: {e}")
