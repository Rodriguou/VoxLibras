"""VoxLibras backend.

Receives tab audio from the browser extension over WebSocket, transcribes it (PT-BR) with
Azure AI Speech and converts each final sentence into Libras gloss with the VLibras translator.

Privacy (LGPD — volatile processing): audio and transcripts only ever live in memory; nothing is
disk and logs never contain transcript text.
"""
