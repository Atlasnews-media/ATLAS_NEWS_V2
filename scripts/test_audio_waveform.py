from audio_waveform import export_peaks, peaks_path_for_audio


assert peaks_path_for_audio("/audio/2026-09-26-resumen-diario.mp3") == (
    "/audio/2026-09-26-resumen-diario.peaks.json"
)
assert export_peaks([0.1, -0.8, 0.3, 0.9], max_length=2) == [[-0.8, 0.9]]
assert export_peaks([0.12554], max_length=1200, precision=10_000) == [[0.1255]]

print("Audio waveform peaks: contrato determinista OK.")
