from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.git_service import router as git_router
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.comments import router as comments_router
from app.api.diff import router as diff_router
from app.core.config import settings
import subprocess
from contextlib import asynccontextmanager

def configure_git():
    """Configure Git with GITHUB_TOKEN if available."""
    if settings.GITHUB_TOKEN:
        print(f"Configuring Git to use GITHUB_TOKEN...")
        try:
            # git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"
            token_url = f"https://{settings.GITHUB_TOKEN}@github.com/"
            subprocess.run(
                ["git", "config", "--global", f"url.{token_url}.insteadOf", "https://github.com/"],
                check=True
            )
            print("Git successfully configured with token injection.")
        except Exception as e:
            print(f"Failed to configure Git with token: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    configure_git()
    yield

app = FastAPI(title="KiCAD Prism API", lifespan=lifespan)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(git_router, prefix="/api/git", tags=["git"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(projects_router, prefix="/api/projects", tags=["projects"])
app.include_router(comments_router, prefix="/api/projects", tags=["comments"])
app.include_router(diff_router, prefix="/api/projects", tags=["diff"])

@app.get("/")
async def root():
    return {"message": "KiCAD Prism Backend is Running"}
