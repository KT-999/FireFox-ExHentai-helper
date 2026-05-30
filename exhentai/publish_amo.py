import os
import sys
import time
import json
import uuid
import hmac
import hashlib
import base64
import zipfile
import subprocess

def base64url_encode(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def generate_jwt(issuer, secret):
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "iss": issuer,
        "jti": str(uuid.uuid4()),
        "iat": int(time.time()),
        "exp": int(time.time()) + 300
    }
    
    b64_header = base64url_encode(json.dumps(header))
    b64_payload = base64url_encode(json.dumps(payload))
    
    msg = f"{b64_header}.{b64_payload}"
    sig = hmac.new(secret.encode('utf-8'), msg.encode('utf-8'), hashlib.sha256).digest()
    
    return f"{msg}.{base64url_encode(sig)}"

def create_zip(zip_name):
    print(f"Creating {zip_name}...")
    exclude_dirs = {'.git', 'node_modules', '.vscode'}
    exclude_files = {zip_name, 'publish_amo.py', '.gitignore', 'README.md'}
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk('.'):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file in files:
                if file in exclude_files or file.endswith('.zip'):
                    continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, '.')
                zf.write(file_path, arcname)
    print("Zip created successfully.")

def upload_to_amo(jwt_token, zip_name, addon_id):
    print("Uploading file to AMO...")
    upload_url = "https://addons.mozilla.org/api/v5/addons/upload/"
    
    # 1. Upload the file
    upload_cmd = [
        "curl.exe", "-s", upload_url,
        "-g", "-X", "POST",
        "-F", f"upload=@{zip_name}",
        "-F", "channel=listed",
        "-H", f"Authorization: JWT {jwt_token}"
    ]
    
    result = subprocess.run(upload_cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Upload command failed: {result.stderr}")
        return False
        
    try:
        upload_data = json.loads(result.stdout)
    except Exception as e:
        print(f"Failed to parse upload response: {result.stdout}")
        return False
        
    if 'uuid' not in upload_data:
        print(f"Upload failed. Response: {upload_data}")
        return False
        
    upload_uuid = upload_data['uuid']
    print(f"Upload successful. UUID: {upload_uuid}")
    
    # 2. Wait for validation
    print("Waiting for validation...")
    status_url = f"https://addons.mozilla.org/api/v5/addons/upload/{upload_uuid}/"
    while True:
        status_cmd = [
            "curl.exe", "-s", status_url,
            "-H", f"Authorization: JWT {jwt_token}"
        ]
        res = subprocess.run(status_cmd, capture_output=True, text=True)
        try:
            status_data = json.loads(res.stdout)
            if status_data.get('processed'):
                if status_data.get('valid'):
                    print("Validation passed!")
                    break
                else:
                    print("Validation failed!")
                    print(json.dumps(status_data.get('validation', {}), indent=2))
                    return False
            else:
                print("Still processing... waiting 3 seconds")
                time.sleep(3)
        except Exception as e:
            print(f"Error checking status: {res.stdout}")
            return False

    # 3. Create the version
    print("Creating new version...")
    version_url = f"https://addons.mozilla.org/api/v5/addons/addon/{addon_id}/versions/"
    
    version_data = json.dumps({"upload": upload_uuid, "license": "all-rights-reserved"})
    
    version_cmd = [
        "curl.exe", "-s", version_url,
        "-g", "-X", "POST",
        "-d", version_data,
        "-H", "Content-Type: application/json",
        "-H", f"Authorization: JWT {jwt_token}"
    ]
    
    result2 = subprocess.run(version_cmd, capture_output=True, text=True)
    try:
        version_resp = json.loads(result2.stdout)
        if 'id' in version_resp:
            print("Version created successfully!")
            print(f"Version ID: {version_resp['id']}")
            print(f"Version string: {version_resp.get('version')}")
            return True
        else:
            # If it fails, print the message, it might be due to validation still in progress
            print(f"Failed to create version. Response: {version_resp}")
            return False
    except:
        print(f"Failed to parse version response: {result2.stdout}")
        return False

if __name__ == "__main__":
    jwt_user = os.environ.get("JWT_USER")
    jwt_key = os.environ.get("JWT_KEY")
    
    if not jwt_user or not jwt_key:
        print("Error: JWT_USER or JWT_KEY environment variables are not set.")
        sys.exit(1)
        
    addon_id = "ExHentai-helper@kenny"
    zip_name = "exhentai_update.zip"
    
    token = generate_jwt(jwt_user, jwt_key)
    create_zip(zip_name)
    upload_to_amo(token, zip_name, addon_id)
