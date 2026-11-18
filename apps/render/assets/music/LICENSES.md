# Music bed — provenance & attribution (ADR-023/024)

One-time local pool of mood-tagged tracks (the YouTube Audio Library has no API).
Organize by mood subfolder to match the publish package's `musicMood` field, e.g.
`upbeat/`, `tense/`, `chill/`. The renderer picks a random track within the matched
mood and mixes it low under the voice.

Good sources with clear terms: YouTube Audio Library (download from Studio),
Pixabay Music (no attribution), Uppbeat (free tier, attribution).

| Track file | Mood | Source | License | Attribution required? | Added |
|------------|------|--------|---------|-----------------------|-------|
| _example.mp3_ | upbeat | _Pixabay url_ | _Pixabay_ | no | 2026-11-03 |
