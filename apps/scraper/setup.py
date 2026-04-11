"""Bay State Scraper - Setup configuration."""

from setuptools import setup, find_packages

setup(
    name="baystate-scraper",
    version="0.3.0",
    description="Distributed headless scraper runners for Bay State Pet and Garden Supply",
    author="Bay State Pet and Garden Supply",
    packages=find_packages(),
    install_requires=[
        "crawl4ai>=0.8.0",
        "google-genai>=1.0.0",
        "langchain-openai>=0.2.0",
        "openai>=1.30.0",
        "playwright>=1.40.0",
        "pyyaml>=6.0",
        "requests==2.31.0",
        "urllib3==2.0.7",
        "chardet<6",
        "httpx>=0.25.0",
        "pandas>=2.0.0",
        "openpyxl>=3.1.0",
        "python-dotenv>=1.0.0",
        "pydantic>=2.0.0",
        "pydantic-settings>=2.0.0",
        "rich>=13.0.0",
        "structlog>=23.0.0",
        "supabase>=2.0.0",
        "playwright-stealth>=1.0.4",
        "eval-type-backport>=0.1.3",
        "sentry-sdk>=1.40.0",
        "pandera>=0.20.0",
        "click>=8.0.0",
    ],
    entry_points={
        "console_scripts": [
            "bsr=cli.main:cli",
        ],
    },
    python_requires=">=3.10",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
