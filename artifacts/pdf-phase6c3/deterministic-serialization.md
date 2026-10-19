# Deterministic serialization

The worker serializes UTF-8 JSON with recursively stable object-key ordering and compact separators. Node/list order remains semantic reading order. Temporary source paths, timestamps, and durations are excluded. Two identical endpoint requests in tests produced byte-identical JSON.
