from dotenv import load_dotenv
from pathlib import Path

# Load .env file before any other imports to ensure env vars are available
PROJECT_ROOT = Path(__file__).resolve().parent.parent
env_file = PROJECT_ROOT / ".env"
load_dotenv(env_file)

from runner.cli import main


if __name__ == "__main__":
    main()
