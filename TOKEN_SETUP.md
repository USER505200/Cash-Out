# 🔧 Railway Token Configuration Guide

## ❌ Current Error

```
InvalidArgumentError: invalid Authorization header
code: 'UND_ERR_INVALID_ARG'
```

This means the bot token is either:
- ❌ **Not set** (undefined)
- ❌ **Too short** (less than 50 characters)
- ❌ **Contains extra spaces** (not trimmed)
- ❌ **Invalid format**

---

## ✅ Solution - Railway Setup

### Step 1: Get Your Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click on your application
3. Go to **Bot** section
4. Under **TOKEN**, click **Copy**
5. **Don't share this token with anyone!**

Example token format:
```
MzAwMjU5NTAwODcwNDUw.C8bAlT.7UmZST1cwjqFJgOwFwbJ3oKv8Xk
```

### Step 2: Add to Railway

**Method 1: Railway Dashboard**
1. Go to [Railway](https://railway.app)
2. Open your project
3. Click **Variables**
4. Add this variable:
   ```
   DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
   ```
5. **Important**: Make sure there are NO spaces before/after the equals sign
6. Click **Deploy** or **Redeploy**

**Method 2: Using Railway CLI**
```bash
railway variables set DISCORD_TOKEN your_bot_token_here
railway redeploy
```

### Step 3: Verify Setup

After deploying, check the logs. You should see:
```
✅ Token validated (60 characters)
✅ Attempted to login...
✅ Logged in as BotName#0000
✅ Slash commands registered
```

---

## 🚨 Common Mistakes

| ❌ Wrong | ✅ Right |
|---------|---------|
| `DISCORD_TOKEN = abc` (spaces) | `DISCORD_TOKEN=abc` (no spaces) |
| `DISCORD_TOKEN="token"` (quotes) | `DISCORD_TOKEN=token` (no quotes) |
| Token with extra spaces at end | Token without any whitespace |
| Missing token entirely | Token pasted correctly |

---

## 🔍 Debug Steps

1. **Check Railway logs** - Look for the validation message
2. **Verify token length** - Should be 50+ characters
3. **No extra spaces** - Copy-paste carefully
4. **Bot has permissions** - Check Discord server settings
5. **Restart the container** - Sometimes caching issues

---

## 📋 Checklist

- [ ] Token copied from Discord Developer Portal
- [ ] Token pasted in Railway Variables (no spaces around `=`)
- [ ] No quotes around the token
- [ ] Token is 50+ characters long
- [ ] Bot has been invited to your server
- [ ] Container has been redeployed
- [ ] Logs show "Token validated"

---

## 🆘 Still Not Working?

1. Delete the old token and add a new one
2. Regenerate the token in Discord Developer Portal
3. Check if Railway can access Discord API (no firewall issues)
4. Try local testing with `npm start`
