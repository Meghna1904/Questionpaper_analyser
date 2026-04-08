import re

def clean_topic(topic: str) -> str:
    # Noise words that don't add semantic value for SBERT matching
    noise_words = [
        "framework for a", "framework for", "framework",
        "system of", "system model", "system",
        "concept of", "introduction to", "introduction",
        "overview of", "overview", "algorithms", "algorithm"
    ]
    
    cleaned = topic.lower()
    for word in noise_words:
        # Replace whole words only to avoid stripping 'system' from 'systems' if we want,
        # but string replace is fine based on user's simple example
        # Let's use regex to remove exact phrases
        cleaned = re.sub(rf'\b{word}\b', '', cleaned)
    
    # Capitalize the first letter for clean UI
    cleaned = " ".join(cleaned.split()).capitalize()
    return cleaned

def split_syllabus(text: str) -> list[str]:
    # Split by comma, hyphens (-), en-dash (–), em-dash (—), or newline
    parts = re.split(r'[,;\n]|\s*[-–—]\s*', text)
    
    cleaned_topics = []
    for p in parts:
        p = clean_topic(p)
        if len(p) > 3:
            cleaned_topics.append(p)
            
    return cleaned_topics

raw_text = """Logical time – framework for a system of logical clocks
Scalar time
Vector time
Leader election algorithms - bully algorithm
Ring algorithm"""

print("RAW TEXT:")
print(raw_text)
print("\n---")
print("SPLIT TOPICS OUTPUT:")
print(split_syllabus(raw_text))
