"""Add Korean narration and short fade transitions to the recorded demo."""
import asyncio
from array import array
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import wave

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VIDEO = ROOT / 'video'
RAW = VIDEO / '부루마봉-시연-원본.mp4'
FINAL = VIDEO / '부루마봉-시연.mp4'
VOICE_WAV = VIDEO / '부루마봉-내레이션.wav'
VOICE_MP3 = VIDEO / '부루마봉-내레이션.mp3'
FFMPEG = HERE / 'node_modules' / 'ffmpeg-static' / 'ffmpeg.exe'
RATE = 48000
sys.path.insert(0, str(HERE / '.pydeps'))
import edge_tts


def run(*args):
    subprocess.run([str(FFMPEG), '-hide_banner', '-loglevel', 'error', '-y', *map(str, args)], check=True)


def duration(file):
    p = subprocess.run([str(FFMPEG), '-hide_banner', '-i', str(file)], capture_output=True, text=True, encoding='utf-8', errors='replace')
    m = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', p.stderr)
    if not m:
        raise RuntimeError(f'영상 길이를 읽지 못했습니다: {file}')
    return int(m[1])*3600 + int(m[2])*60 + float(m[3])


def speakable(text):
    return text.replace('1365', '일삼육오').replace('AI(Amazon Bedrock)', '아마존 베드록 인공지능').replace('AI', '인공지능').replace('6자리', '여섯 자리').replace('·', ', ')


async def synthesize(captions):
    for i, item in enumerate(captions):
        dest = VIDEO / f'narration-{i:02}.mp3'
        voice = edge_tts.Communicate(speakable(item['text']), 'ko-KR-SunHiNeural', rate='-5%')
        await voice.save(str(dest))
        print(f'TTS {i+1}/{len(captions)}: {item["text"]}', flush=True)


def narration(captions, total):
    samples = array('h', [0]) * (int(total * RATE) + 1)
    for i, item in enumerate(captions):
        mp3 = VIDEO / f'narration-{i:02}.mp3'
        wav = VIDEO / f'narration-{i:02}.wav'
        available = (captions[i+1]['time'] if i+1 < len(captions) else total) - item['time'] - .35
        run('-i', mp3, '-ar', RATE, '-ac', 1, '-c:a', 'pcm_s16le', wav)
        with wave.open(str(wav), 'rb') as f:
            length = f.getnframes() / f.getframerate()
        if length > available and available > 0:
            run('-i', mp3, '-af', f'atempo={min(1.9, length/available):.3f}', '-ar', RATE, '-ac', 1, '-c:a', 'pcm_s16le', wav)
        with wave.open(str(wav), 'rb') as f:
            pcm = array('h'); pcm.frombytes(f.readframes(f.getnframes()))
        start = int((item['time'] + .18) * RATE)
        fade = int(.07 * RATE)
        for j, value in enumerate(pcm):
            k = start + j
            if k >= len(samples):
                break
            gain = .9 * min(1, j/fade, (len(pcm)-j)/fade)
            samples[k] = max(-32768, min(32767, samples[k] + int(value * gain)))
        wav.unlink()
        mp3.unlink()
    with wave.open(str(VOICE_WAV), 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(samples.tobytes())
    audio_filter = 'highpass=f=90,lowpass=f=8000,acompressor=threshold=0.08:ratio=2:attack=10:release=160,loudnorm=I=-16:TP=-1.5:LRA=7'
    run('-i', VOICE_WAV, '-af', audio_filter, '-c:a', 'libmp3lame', '-b:a', '192k', VOICE_MP3)


def video_with_fades(transitions, total):
    cuts = [(x['at'] + x['done']) / 2 for x in transitions]
    bounds = [0, *cuts, total]
    n = len(bounds) - 1
    filters = ['[0:v]split=' + str(n) + ''.join(f'[s{i}]' for i in range(n))]
    for i, (start, end) in enumerate(zip(bounds, bounds[1:])):
        length = end-start
        chain = f'[s{i}]trim=start={start:.3f}:end={end:.3f},setpts=PTS-STARTPTS'
        if i == 0:
            chain += ',fade=t=in:st=0:d=0.45'
        else:
            chain += ',fade=t=in:st=0:d=0.35'
        if i < n-1:
            chain += f',fade=t=out:st={max(0,length-.35):.3f}:d=0.35'
        filters.append(chain + f'[v{i}]')
    filters.append(''.join(f'[v{i}]' for i in range(n)) + f'concat=n={n}:v=1:a=0[v]')
    run('-i', RAW, '-i', VOICE_MP3, '-filter_complex', ';'.join(filters), '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', FINAL)


def main():
    if not RAW.exists() or not FFMPEG.exists():
        raise FileNotFoundError('원본 영상이나 ffmpeg가 없습니다. README의 녹화 단계를 먼저 실행해 주세요.')
    info = json.loads((VIDEO / '시연-기록.json').read_text(encoding='utf-8'))
    total = duration(RAW)
    asyncio.run(synthesize(info['captions']))
    narration(info['captions'], total)
    print('전환 효과와 내레이션 합성 중…', flush=True)
    video_with_fades(info['transitions'], total)
    print(f'완료: {FINAL} ({duration(FINAL):.2f}초)', flush=True)


if __name__ == '__main__':
    main()
