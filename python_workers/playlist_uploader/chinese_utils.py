import re

try:
    from pypinyin import pinyin, Style
    HAS_PYPINYIN = True
except ImportError:
    HAS_PYPINYIN = False

try:
    from opencc import OpenCC
    cc = OpenCC('t2s')  
    HAS_OPENCC = True
except ImportError:
    HAS_OPENCC = False
    cc = None


def is_chinese(text: str) -> bool:
    """Check if text contains Chinese characters."""
    if not text:
        return False
    for char in text:
        if '\u4e00' <= char <= '\u9fff':
            return True
    return False


def to_simplified(text: str) -> str:
    """Convert Traditional Chinese to Simplified Chinese."""
    if not HAS_OPENCC or not text or not is_chinese(text):
        return text
    return cc.convert(text)


def to_pinyin(text: str) -> str:
    """Convert Chinese text to Pinyin (no tones, space-separated)."""
    if not HAS_PYPINYIN or not text or not is_chinese(text):
        return ""

    py_list = pinyin(text, style=Style.NORMAL, errors='ignore')
    return ' '.join([item[0] for item in py_list if item])


def to_pinyin_no_spaces(text: str) -> str:
    """Convert Chinese text to Pinyin without spaces."""
    if not HAS_PYPINYIN or not text or not is_chinese(text):
        return ""

    py_list = pinyin(text, style=Style.NORMAL, errors='ignore')
    return ''.join([item[0] for item in py_list if item])


def normalize_query(text: str) -> str:
    """Normalize text for search matching."""
    if not text:
        return ""
    return re.sub(r'\s+', ' ', text.lower().strip())


def generate_search_terms(title: str, artist: str) -> list:
    """Generate comprehensive search terms including Pinyin variants."""
    terms = set()

    # Basic terms
    if title:
        terms.add(normalize_query(title))
    if artist:
        terms.add(normalize_query(artist))
    if title and artist:
        terms.add(normalize_query(f"{title} {artist}"))
        terms.add(normalize_query(f"{artist} {title}"))

    if HAS_PYPINYIN:
        if is_chinese(title):
            title_py = to_pinyin(title)
            title_py_nospace = to_pinyin_no_spaces(title)
            if title_py:
                terms.add(normalize_query(title_py))
            if title_py_nospace:
                terms.add(normalize_query(title_py_nospace))

        if is_chinese(artist):
            artist_py = to_pinyin(artist)
            artist_py_nospace = to_pinyin_no_spaces(artist)
            if artist_py:
                terms.add(normalize_query(artist_py))
            if artist_py_nospace:
                terms.add(normalize_query(artist_py_nospace))

        if is_chinese(title) or is_chinese(artist):
            title_part = to_pinyin(title) if is_chinese(title) else title
            artist_part = to_pinyin(artist) if is_chinese(artist) else artist
            if title_part and artist_part:
                terms.add(normalize_query(f"{title_part} {artist_part}"))

    terms.discard("")

    return sorted(list(terms))


def extract_artist_from_title(title: str, uploader: str) -> tuple:
    """Extract artist from title patterns like 'Artist - Song'."""
    separators = [' - ', ' – ', ' — ', ' | ']
    bracket_pairs = [('「', '」'), ('『', '』')]

    for sep in separators:
        if sep in title:
            parts = title.split(sep, 1)
            if len(parts) == 2:
                part1, part2 = parts[0].strip(), parts[1].strip()

                title_keywords = ['mv', 'official', 'lyric', 'audio', 'video', 'cover', 'live']

                p1_lower = part1.lower()
                p2_lower = part2.lower()

                if any(kw in p2_lower for kw in title_keywords):
                    return part1, part2  
                elif any(kw in p1_lower for kw in title_keywords):
                    return part2, part1  

                return part1, part2

    for open_b, close_b in bracket_pairs:
        if open_b in title and close_b in title:
            start = title.find(open_b)
            end = title.find(close_b)
            if start < end:
                inside = title[start + 1:end].strip()
                outside = (title[:start] + title[end + 1:]).strip()
                if inside and outside:
                    return outside, inside

    artist = uploader
    for suffix in [' - Topic', 'VEVO', ' Official', ' Music']:
        if artist.endswith(suffix):
            artist = artist[:-len(suffix)].strip()

    return artist, title
