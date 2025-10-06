# Discord Media Downloader - Hours Override Feature

## Overview
The Discord Media Downloader now supports custom time overrides to specify exactly how many hours back to look for content. This is useful when the system gets confused or you want to override the starting point.

## Usage

### Standard Usage (Default 20-day cutoff)
```bash
npm run download
```

### Custom Hours Override
Use the predefined scripts for common time periods:

```bash
# Download from last 24 hours
npm run download:24h

# Download from last 12 hours
npm run download:12h

# Download from last 6 hours
npm run download:6h

# Download from last 2 hours
npm run download:2h

# Download from last 1 hour
npm run download:1h
```

### Custom Hours (Any number)
Or specify any custom number of hours:

```bash
# Download from last 8 hours
npm run download -- 8

# Download from last 48 hours
npm run download -- 48

# Download from last 3 hours
npm run download -- 3
```

## How It Works

When you use an hours override:

1. **⚠️ Automatic Reset**: The system automatically resets processed messages to start fresh from the new time point
2. **🕐 Time Calculation**: Calculates cutoff date by going back the specified number of hours from current time
3. **📅 Channel Reset**: Resets all channel timestamps to start from the new cutoff point
4. **💾 Immediate Save**: Saves the reset state immediately to prevent data loss
5. **🔄 Preserved Channels**: Maintains the existing channel configuration

## Example Output

```bash
$ npm run download:2h

🕒 STARTING WITH CUSTOM TIME OVERRIDE: 2 hours back
📍 This will override the default 20-day cutoff and process messages from the last 2 hours
⚠️  WARNING: This will reset processed messages to start from this new time point
🕐 Using hours override: 2 hours back from now
📅 Override cutoff date: 2025-10-06T05:47:39.191Z
🤖 Enhanced Discord Media Downloader
📥 Downloading media from Discord channels with internet safeguards...

🔄 Hours override detected - resetting processed messages to start from 2 hours back
📋 Loaded default channel configuration
📅 Reset 8 channels to start from: 2025-10-06T05:47:39.191Z
🆔 Using cutoff snowflake: 1304428544
💾 Saved reset state with hours override
✅ Logged in as memobot#9647

🔄 Processing 8 channels with enhanced error handling...
```

## Use Cases

### 1. Recovery from Issues
If the system gets confused or processes wrong content, use hours override to reset:
```bash
npm run download:6h  # Reset to last 6 hours and start fresh
```

### 2. Finding Recent Content
When you want to find only very recent content:
```bash
npm run download:1h  # Only content from last hour
```

### 3. Testing & Debugging
For testing specific time periods:
```bash
npm run download -- 4  # Custom 4-hour window for testing
```

### 4. Missed Content
If you think the system missed content from a specific period:
```bash
npm run download:12h  # Re-scan last 12 hours for missed content
```

## Important Notes

⚠️ **WARNING**: Using hours override will:
- Reset all processed messages
- Clear the download history
- Start fresh from the specified time point
- Re-download content that may have been processed before

✅ **Safe Usage**:
- Perfect for recovery from errors
- Great for finding recent content
- Automatically preserves channel configuration
- Maintains all safety features and retry logic

## Technical Details

- **Default Behavior**: 20-day cutoff starting from 00:00 AM today
- **Override Behavior**: Custom hours back from current time
- **Snowflake Generation**: Converts timestamp to Discord message ID format
- **Channel Processing**: Processes from most recent backwards to cutoff point
- **Date Filtering**: Skips messages older than the cutoff date

## Error Handling

If you provide an invalid hours value:
```bash
npm run download -- invalid
❌ Invalid hours value: "invalid". Please provide a valid number.
```

The system validates input and provides helpful error messages.