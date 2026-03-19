from dotenv import load_dotenv
import os

# Load .env file before any other imports to ensure env vars are available
# Try .env.development first, then fall back to .env
env_file = ".env.development" if os.path.exists(".env.development") else ".env"
load_dotenv(env_file)

from runner.cli import main


if __name__ == "__main__":
    main()
