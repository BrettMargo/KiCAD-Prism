from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.git_service import router as git_router
from app.api.auth import router as auth_router
from app.api.projects import router as projects_router
from app.api.comments import router as comments_router

app = FastAPI(title="KiCAD Prism API")

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

@app.get("/")
async def root():
    return {"message": "KiCAD Prism Backend is Running"}
