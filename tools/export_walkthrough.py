"""Export a self-contained H.264/AAC MP4 from an error-free live take and its measured narration."""
import json,re,subprocess,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'docs/walkthrough'
FFMPEG=ROOT/'tools/media-tools/ffmpeg.exe'

def stamp(seconds):
    milliseconds=round(seconds*1000);hours,milliseconds=divmod(milliseconds,3600000);minutes,milliseconds=divmod(milliseconds,60000);seconds,milliseconds=divmod(milliseconds,1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'

def main():
    manifest=json.loads((OUT/'scenes.json').read_text(encoding='utf-8'))
    original_manifest=manifest
    if any(scene.get('error') for scene in manifest['scenes']):raise SystemExit('A live scene failed; do not export it as a passing walkthrough.')
    timings=json.loads((OUT/'narration/timings.json').read_text(encoding='utf-8'))
    if not FFMPEG.exists():raise SystemExit('Install full FFmpeg in tools/media-tools/ffmpeg.exe')
    subprocess.run(['python',str(ROOT/'tools/narrate_walkthrough.py')],check=True)
    # Keep genuine screen actions; shorten long waits by at most 2x, with room for the whole voice.
    edited=[];cursor=0
    for scene in manifest['scenes']:
        speech=timings[scene['id']]['durationMs']
        length=round(min(scene['durationMs'],max(speech+4200,scene['durationMs']/2)))
        edited.append(dict(scene,sourceStartMs=scene['startMs'],sourceEndMs=scene['endMs'],startMs=cursor,endMs=cursor+length,durationMs=length))
        cursor+=length
    manifest=dict(manifest,scenes=edited,totalMs=cursor)
    (OUT/'standalone-scenes.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with wave.open(str(OUT/'narration/raw'/timings[edited[0]['id']]['file'])) as wav:
        channels,width,rate=wav.getnchannels(),wav.getsampwidth(),wav.getframerate()
    audio=bytearray(round(cursor*rate/1000)*channels*width)
    for scene in edited:
        with wave.open(str(OUT/'narration/raw'/timings[scene['id']]['file'])) as wav:
            if (wav.getnchannels(),wav.getsampwidth(),wav.getframerate())!=(channels,width,rate):raise SystemExit('Mixed voice formats')
            samples=wav.readframes(wav.getnframes())
        start=round((scene['startMs']+1200)*rate/1000)*channels*width
        audio[start:start+len(samples)]=samples
    voice_path=OUT/'ninecube-mp4-narration.wav'
    with wave.open(str(voice_path),'wb') as wav:
        wav.setnchannels(channels);wav.setsampwidth(width);wav.setframerate(rate);wav.writeframes(audio)
    branches=''.join(f'[s{i}]' for i in range(len(edited)))
    filters=[f'[0:v]split={len(edited)}'+branches]
    for i,scene in enumerate(edited):
        ratio=scene['durationMs']/(scene['sourceEndMs']-scene['sourceStartMs'])
        correction=""
        if scene['id']=='adjust-refused':
            # Correct only the editorial lower-third: the application and its refusal stay untouched.
            font=r"C\:/Windows/Fonts/segoeui.ttf"
            correction=",drawbox=x=28:y=710:w=1384:h=164:color=0x100c08:t=fill,drawtext=fontfile='"+font+"':text='NEGATIVE STOCK REJECTED':x=48:y=730:fontsize=17:fontcolor=0xffab4d,drawtext=fontfile='"+font+"':text='The API refused the negative withdrawal. No stock change was written.':x=48:y=766:fontsize=22:fontcolor=white"
        filters.append(f"[s{i}]trim=start={scene['sourceStartMs']/1000}:end={scene['sourceEndMs']/1000},setpts=(PTS-STARTPTS)*{ratio:.8f}"+correction+f"[v{i}]")
    filters.append(''.join(f'[v{i}]' for i in range(len(edited)))+f'concat=n={len(edited)}:v=1:a=0,fps=25,format=yuv420p[video]')
    metadata=[';FFMETADATA1','title=NineCube Digital - Live System Walkthrough','comment=Live application footage with measured Windows voice narration. Demo records are identified on screen.']
    subtitles=[];number=0
    for scene in manifest['scenes']:
        metadata += ['[CHAPTER]','TIMEBASE=1/1000',f"START={scene['startMs']}",f"END={scene['endMs']}",'title='+re.sub(r'([\\=;#])',r'\\\1',scene['title'])]
        words=scene['narration'].split();chunks=[' '.join(words[i:i+12]) for i in range(0,len(words),12)]
        speech=timings[scene['id']]['durationMs']/1000;start=scene['startMs']/1000+1.2
        for i,chunk in enumerate(chunks):
            number+=1;subtitles += [str(number),stamp(start+i*speech/len(chunks))+' --> '+stamp(start+(i+1)*speech/len(chunks)),chunk,'']
    (OUT/'chapters.ffmeta').write_text('\n'.join(metadata)+'\n',encoding='utf-8')
    (OUT/'ninecube-walkthrough.srt').write_text('\n'.join(subtitles),encoding='utf-8')
    target=OUT/'ninecube-walkthrough.mp4'
    command=[str(FFMPEG),'-hide_banner','-y','-i',str(OUT/'ninecube-walkthrough.webm'),'-i',str(voice_path),'-f','ffmetadata','-i',str(OUT/'chapters.ffmeta'),'-i',str(OUT/'ninecube-walkthrough.srt'),'-filter_complex_threads','1','-filter_complex',';'.join(filters),'-map','[video]','-map','1:a:0','-map','3:s:0','-map_metadata','2','-map_chapters','2','-c:v','libx264','-preset','veryfast','-crf','19','-threads','4','-af','loudnorm=I=-16:TP=-1.5:LRA=11','-c:a','aac','-b:a','128k','-ar','48000','-c:s','mov_text','-metadata:s:a:0','language=eng','-metadata:s:s:0','language=eng','-movflags','+faststart','-t',str(manifest['totalMs']/1000),str(target)]
    with (OUT/'export.log').open('w',encoding='utf-8') as log:subprocess.run(command,stdout=log,stderr=log,check=True)
    with (OUT/'decode-check.log').open('w',encoding='utf-8') as log:
        subprocess.run([str(FFMPEG),'-hide_banner','-v','error','-xerror','-i',str(target),'-map','0:v:0','-map','0:a:0','-f','null','-'],stdout=log,stderr=log,check=True)
    probe=subprocess.run([str(FFMPEG),'-hide_banner','-i',str(target)],capture_output=True,text=True).stderr
    levels=subprocess.run([str(FFMPEG),'-hide_banner','-i',str(target),'-vn','-sn','-af','volumedetect','-f','null','-'],capture_output=True,text=True,check=True).stderr
    mean=re.search(r'mean_volume: (-?[0-9.]+) dB',levels)
    if not mean or float(mean[1]) < -55:raise SystemExit('Exported audio is silent or too quiet')
    (OUT/'audio-check.log').write_text(levels,encoding='utf-8')
    if 'Video: h264' not in probe or 'Audio: aac' not in probe:raise SystemExit('Expected H.264 picture and embedded AAC sound')
    with wave.open(str(voice_path)) as wav:audio_seconds=wav.getnframes()/wav.getframerate()
    if abs(audio_seconds-manifest['totalMs']/1000)>.1:raise SystemExit('Narration timeline and picture manifest are out of sync')
    report=dict(file=target.name,bytes=target.stat().st_size,scenes=len(manifest['scenes']),sceneFailures=[],durationSeconds=manifest['totalMs']/1000,narrationSeconds=audio_seconds,videoCodec='H.264',audioCodec='AAC',subtitleCodec='mov_text',fullDecode='passed',speechEngine='Microsoft David Desktop (synthetic narration)',source='Fresh live application recording',chapters=True,meanAudioDb=float(mean[1]),maximumWaitAcceleration='2x')
    (OUT/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    (OUT/'PLAY-VIDEO.cmd').write_text('@echo off\r\nstart "" "%~dp0ninecube-walkthrough.mp4"\r\n',encoding='ascii')
    original_manifest['standalone']='ninecube-walkthrough.mp4'
    original_manifest['standaloneDurationMs']=manifest['totalMs']
    (OUT/'scenes.json').write_text(json.dumps(original_manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
