from fastapi import APIRouter, HTTPException
import os
import subprocess
from pathlib import Path
from pydantic import BaseModel

router = APIRouter()

# In Docker, home is /root. SSH keys are usually in ~/.ssh
SSH_DIR = Path.home() / ".ssh"
PRIVATE_KEY = SSH_DIR / "id_ed25519"
PUBLIC_KEY = SSH_DIR / "id_ed25519.pub"

class SSHKeyResponse(BaseModel):
    exists: bool
    public_key: str | None = None

class GenerateSSHKeyRequest(BaseModel):
    email: str = "kicad-prism@example.com"

@router.get("/ssh-key", response_model=SSHKeyResponse)
async def get_ssh_key():
    """Get the current SSH public key if it exists."""
    if not PUBLIC_KEY.exists():
        return {"exists": False, "public_key": None}
    
    try:
        with open(PUBLIC_KEY, "r") as f:
            return {"exists": True, "public_key": f.read().strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading public key: {str(e)}")

@router.post("/ssh-key/generate")
async def generate_ssh_key(request: GenerateSSHKeyRequest):
    """Generate a new Ed25519 SSH key."""
    if PRIVATE_KEY.exists():
        # If key exists, we don't error out, just return existing public key?
        # User might want to regenerate. Let's allow regeneration but maybe with a force flag?
        # For now, let's just error if it exists to prevent accidental overwrite, or maybe just overwrite?
        # The prompt setup "Generate New SSH Key" implies creating a NEW one. 
        # Let's simple delete old one if it exists or just overwrite. ssh-keygen -f overwrites if we say yes?
        # We can just remove the old files first.
        try:
             os.remove(PRIVATE_KEY)
             if PUBLIC_KEY.exists():
                 os.remove(PUBLIC_KEY)
        except OSError as e:
             raise HTTPException(status_code=500, detail=f"Failed to remove existing key: {e}")
    
    # Ensure .ssh directory exists and has correct permissions
    SSH_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(SSH_DIR, 0o700)
    
    try:
        # Generate key without passphrase (-N "")
        subprocess.run(
            ["ssh-keygen", "-t", "ed25519", "-C", request.email, "-N", "", "-f", str(PRIVATE_KEY)],
            check=True,
            capture_output=True
        )
        
        # Ensure private key has correct permissions
        os.chmod(PRIVATE_KEY, 0o600)
        
        with open(PUBLIC_KEY, "r") as f:
            return {"success": True, "public_key": f.read().strip()}
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode() if e.stderr else "Unknown error"
        raise HTTPException(status_code=500, detail=f"Failed to generate SSH key: {error_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
