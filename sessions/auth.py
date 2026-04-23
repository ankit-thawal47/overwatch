import secrets

# 4-digit PIN — easy to type on mobile
ACCESS_TOKEN = str(secrets.randbelow(9000) + 1000)  # 1000–9999
