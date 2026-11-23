# Banc #680 : deux flux temps réel (micro et son système) vers un serveur
# NeMo-Speech.cpp, comme l'application (session.update, PCM16 16 kHz en
# trames de 20 ms au rythme réel, un seul commit à la fin). Mesure le délai
# du premier texte provisoire et le retard des résultats finaux. Le contenu
# transcrit n'est pas affiché : seulement des nombres.
import asyncio, json, sys, time, wave

import websockets

# Usage : stream2.py URL FICHIER [FICHIER] [--speed X] [--nodiar]
# Un seul fichier : profil dégradé « un seul flux (micro) ».
ARGS = sys.argv[1:]
URL = ARGS.pop(0)
SPEED = 1.0
DIAR = True
FILES = []
while ARGS:
    arg = ARGS.pop(0)
    if arg == "--speed":
        SPEED = float(ARGS.pop(0))
    elif arg == "--nodiar":
        DIAR = False
    else:
        FILES.append(arg)
assert 1 <= len(FILES) <= 2, "un ou deux fichiers"
FRAME_MS = 20


def pcm16_16k(path):
    # Fichiers préparés en 16 kHz, mono, PCM16 (ffmpeg).
    with wave.open(path, "rb") as w:
        assert (w.getsampwidth(), w.getnchannels(), w.getframerate()) == (2, 1, 16000)
        return w.readframes(w.getnframes())


async def stream(path, t0, results):
    pcm = pcm16_16k(path)
    seconds = len(pcm) / 32000
    first_delta = None
    finals = []
    closed_at = None
    partials = 0
    async with websockets.connect(
        URL,
        max_size=None,
        # Sans ping : NeMo-Speech.cpp 0.3.0 coupe la connexion (1006) quand un
        # ping arrive alors qu'il a du retard sur le temps réel. Le client de
        # Syntheo n'envoie pas de ping non plus.
        ping_interval=None,
    ) as ws:
        await ws.send(
            json.dumps(
                {
                    "type": "session.update",
                    "session": {
                        "language": "fr-FR",
                        "sample_rate": 16000,
                        "automatic_punctuation": True,
                        "word_timestamps": True,
                        "speaker_diarization": DIAR,
                        "endpointing_ms": 1000,
                    },
                }
            )
        )
        start = time.monotonic()

        async def sender():
            step = 32 * FRAME_MS
            for i in range(0, len(pcm), step):
                await ws.send(pcm[i : i + step])
                target = start + (i + step) / 32000 / SPEED
                delay = target - time.monotonic()
                if delay > 0:
                    await asyncio.sleep(delay)
            await ws.send(json.dumps({"type": "input_audio_buffer.commit"}))

        async def receiver():
            nonlocal first_delta, closed_at, partials
            try:
                await receive()
            except websockets.exceptions.ConnectionClosed:
                closed_at = time.monotonic() - start

        async def receive():
            nonlocal first_delta, partials
            async for raw in ws:
                if isinstance(raw, bytes):
                    continue
                msg = json.loads(raw)
                kind = msg.get("type", "")
                now = time.monotonic() - start
                if kind.endswith(".delta") and msg.get("delta"):
                    partials += 1
                    if first_delta is None:
                        first_delta = now
                if kind.endswith(".completed"):
                    words = msg.get("words") or []
                    end = max((w.get("end", 0) for w in words), default=None)
                    finals.append((now, end))
                    if (
                        now * SPEED >= seconds - 0.05
                        and end is not None
                        and end >= seconds - 2.5
                    ):
                        return
                if kind == "error":
                    print("erreur serveur", file=sys.stderr)
                    return

        send = asyncio.create_task(sender())
        try:
            await asyncio.wait_for(receiver(), timeout=seconds / SPEED + 120)
        except asyncio.TimeoutError:
            pass
        try:
            await send
        except websockets.exceptions.ConnectionClosed:
            closed_at = closed_at or time.monotonic() - start
        elapsed = time.monotonic() - start
    lags = [now - end / SPEED for now, end in finals if end is not None]
    results[path] = {
        "audio_s": round(seconds, 1),
        "first_partial_s": None if first_delta is None else round(first_delta, 2),
        "finals": len(finals),
        "final_lag_mean_s": round(sum(lags) / len(lags), 2) if lags else None,
        "final_lag_max_s": round(max(lags), 2) if lags else None,
        "elapsed_s": round(elapsed, 1),
        "partials": partials,
        "closed_at_s": None if closed_at is None else round(closed_at, 1),
    }


async def main():
    results = {}
    t0 = time.monotonic()
    await asyncio.gather(*(stream(f, t0, results) for f in FILES))
    print(json.dumps({k.rsplit("/", 1)[-1]: v for k, v in results.items()}, indent=1))


asyncio.run(main())
