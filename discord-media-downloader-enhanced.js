#!/usr/bin/env node

import { Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DiscordMediaDownloaderEnhanced {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.channelDatesFile = path.join(__dirname, 'channel_dates.json');
        this.processedMessagesFile = path.join(__dirname, 'processed_messages.json');
        this.imagesDir = path.join(__dirname, 'saved_images');
        this.videosDir = path.join(__dirname, 'saved_videos');

        this.channelDates = { dates: {}, lastUpdated: null };
        this.processedMessages = new Set();

        this.stats = {
            totalMessages: 0,
            newMessages: 0,
            imagesSaved: 0,
            videosSaved: 0,
            errors: 0,
            retries: 0,
            connectionErrors: 0
        };

        // Enhanced retry configuration
        this.retryConfig = {
            maxRetries: 3,
            baseDelay: 2000, // 2 seconds
            maxDelay: 30000, // 30 seconds
            backoffMultiplier: 2
        };

        // Connection monitoring
        this.connectionState = {
            isConnected: false,
            lastCheck: null,
            consecutiveFailures: 0,
            maxConsecutiveFailures: 5
        };
    }

    async init() {
        console.log('🤖 Enhanced Discord Media Downloader');
        console.log('📥 Downloading media from Discord channels with internet safeguards...\n');

        await fs.ensureDir(this.imagesDir);
        await fs.ensureDir(this.videosDir);

        if (!process.env.DISCORD_BOT_TOKEN) {
            throw new Error('DISCORD_BOT_TOKEN not found in .env file');
        }

        await this.loadTrackingFiles();

        // Setup Discord connection monitoring
        this.setupConnectionMonitoring();

        this.client.on('ready', () => {
            console.log(`✅ Logged in as ${this.client.user.tag}`);
            this.connectionState.isConnected = true;
            this.connectionState.lastCheck = Date.now();
            this.startDownload();
        });

        this.client.on('disconnect', () => {
            this.connectionState.isConnected = false;
            console.log('⚠️  Discord connection lost');
        });

        this.client.on('reconnecting', () => {
            console.log('🔄 Attempting to reconnect to Discord...');
        });

        await this.client.login(process.env.DISCORD_BOT_TOKEN);
    }

    setupConnectionMonitoring() {
        // Monitor connection every 30 seconds
        setInterval(() => {
            this.checkConnectionHealth();
        }, 30000);

        // Auto-save every 60 seconds to prevent data loss
        setInterval(() => {
            this.saveTrackingFiles();
            console.log('💾 Auto-saved progress');
        }, 60000);
    }

    async checkConnectionHealth() {
        try {
            const now = Date.now();
            this.connectionState.lastCheck = now;

            if (!this.connectionState.isConnected) {
                this.connectionState.consecutiveFailures++;
                console.log(`❌ Connection check failed (${this.connectionState.consecutiveFailures}/${this.connectionState.maxConsecutiveFailures})`);

                if (this.connectionState.consecutiveFailures >= this.connectionState.maxConsecutiveFailures) {
                    console.log('🚨 Too many connection failures - saving progress and pausing');
                    await this.saveTrackingFiles();
                    // Could implement wait strategy here
                }
                return;
            }

            // Reset failure count on successful connection
            this.connectionState.consecutiveFailures = 0;

        } catch (error) {
            this.connectionState.consecutiveFailures++;
            this.stats.connectionErrors++;
            console.log(`❌ Connection health check failed: ${error.message}`);
        }
    }

    async loadTrackingFiles() {
        try {
            if (await fs.pathExists(this.channelDatesFile)) {
                const data = await fs.readJson(this.channelDatesFile);
                this.channelDates = data;
                console.log(`📋 Loaded ${Object.keys(data.dates).length} channel timestamps`);
            } else {
                console.log('📋 No channel dates found - starting fresh');
            }

            if (await fs.pathExists(this.processedMessagesFile)) {
                const data = await fs.readJson(this.processedMessagesFile);
                const messages = Array.isArray(data) ? data : (data.messages || []);
                this.processedMessages = new Set(messages);
                console.log(`📋 Loaded ${messages.length} processed message IDs`);
            } else {
                console.log('📋 No processed messages found - starting fresh');
            }
        } catch (error) {
            console.error('❌ Error loading tracking files:', error.message);
            // Try to backup corrupted files
            await this.backupCorruptedFiles();
        }
    }

    async backupCorruptedFiles() {
        try {
            const timestamp = new Date().toISOString().replace(/:/g, '-');
            if (await fs.pathExists(this.channelDatesFile)) {
                await fs.copy(this.channelDatesFile, `${this.channelDatesFile}.corrupted.${timestamp}`);
            }
            if (await fs.pathExists(this.processedMessagesFile)) {
                await fs.copy(this.processedMessagesFile, `${this.processedMessagesFile}.corrupted.${timestamp}`);
            }
            console.log(`📁 Backed up potentially corrupted files`);
        } catch (backupError) {
            console.error('❌ Failed to backup corrupted files:', backupError.message);
        }
    }

    async saveTrackingFiles() {
        try {
            await fs.writeJson(this.channelDatesFile, this.channelDates, { spaces: 2 });

            // Save processed messages in batches to handle large sets
            const messages = Array.from(this.processedMessages);
            const batchSize = 10000;
            for (let i = 0; i < messages.length; i += batchSize) {
                const batch = messages.slice(i, i + batchSize);
                if (i === 0) {
                    await fs.writeJson(this.processedMessagesFile, { messages: batch }, { spaces: 2 });
                } else {
                    // Append to existing file for large sets
                    const existing = await fs.readJson(this.processedMessagesFile);
                    existing.messages.push(...batch);
                    await fs.writeJson(this.processedMessagesFile, existing, { spaces: 2 });
                }
            }
        } catch (error) {
            console.error('❌ Error saving tracking files:', error.message);
            this.stats.errors++;
        }
    }

    async startDownload() {
        const channelIds = Object.keys(this.channelDates.dates);

        if (channelIds.length === 0) {
            console.log('⚠️  No channels configured. Please add channel IDs to channel_dates.json');
            process.exit(0);
        }

        console.log(`\n🔄 Processing ${channelIds.length} channels with enhanced error handling...\n`);

        for (const channelId of channelIds) {
            try {
                await this.downloadFromChannel(channelId);
                // Save progress after each channel
                await this.saveTrackingFiles();
                console.log(`💾 Progress saved after processing channel ${channelId}`);
            } catch (error) {
                console.error(`❌ Critical error in channel ${channelId}:`, error.message);
                this.stats.errors++;
                // Continue with next channel instead of failing completely
            }
        }

        this.channelDates.lastUpdated = new Date().toISOString();
        await this.saveTrackingFiles();

        this.printStats();
        process.exit(0);
    }

    async downloadFromChannel(channelId) {
        try {
            const channel = await this.retryOperation(
                () => this.client.channels.fetch(channelId),
                `fetch channel ${channelId}`
            );

            if (!channel || !channel.isTextBased()) {
                console.log(`⚠️  Channel ${channelId} not found or not text-based`);
                return;
            }

            console.log(`📢 Fetching from: ${channel.name || channelId}`);

            // Get the most recent processed message ID to use as starting point
            const processedMessages = Array.from(this.processedMessages);
            let afterId = null;

            if (processedMessages.length > 0) {
                // Use the most recently processed message ID as starting point
                afterId = processedMessages[processedMessages.length - 1];
                console.log(`   Using most recent processed message ID: ${afterId}`);
            } else {
                console.log(`   No processed messages found - fetching recent messages`);
            }

            let messageCount = 0;
            let consecutiveEmptyFetches = 0;
            const maxEmptyFetches = 3;

            // Fetch messages with retry logic
            let messages = await this.retryOperation(
                () => {
                    const options = { limit: 100 };
                    if (afterId) {
                        options.after = afterId;
                    }
                    return channel.messages.fetch(options);
                },
                `fetch initial messages from channel ${channelId}`
            );

            while (messages.size > 0) {
                for (const message of messages.values()) {
                    if (this.processedMessages.has(message.id)) {
                        continue;
                    }

                    this.stats.totalMessages++;
                    messageCount++;

                    await this.processMessage(message);

                    this.processedMessages.add(message.id);
                    this.channelDates.dates[channelId] = message.id;
                }

                if (messages.size < 100) {
                    consecutiveEmptyFetches++;
                    if (consecutiveEmptyFetches >= maxEmptyFetches) {
                        console.log(`   📭 No more messages found after ${maxEmptyFetches} empty fetches`);
                        break;
                    }
                } else {
                    consecutiveEmptyFetches = 0;
                }

                const lastMessage = messages.last();
                messages = await this.retryOperation(
                    () => channel.messages.fetch({ limit: 100, after: lastMessage.id }),
                    `fetch next batch of messages from channel ${channelId}`
                );
            }

            console.log(`   ✅ Processed ${messageCount} new messages\n`);

        } catch (error) {
            console.error(`❌ Error in channel ${channelId}:`, error.message);
            this.stats.errors++;
            throw error; // Re-throw to be handled by startDownload
        }
    }

    async processMessage(message) {
        if (message.attachments.size === 0) return;

        for (const attachment of message.attachments.values()) {
            await this.downloadAttachment(attachment, message);
        }
    }

    async downloadAttachment(attachment, message) {
        const ext = path.extname(attachment.name || attachment.url).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext);
        const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.3gp'].includes(ext);

        if (!isImage && !isVideo) return;

        const timestamp = new Date(message.createdTimestamp).toISOString().replace(/:/g, '-').split('.')[0] + 'Z';
        const hash = message.id.slice(-8);
        const sanitizedName = (attachment.name || 'media').replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${timestamp}_${hash}_${sanitizedName}`;

        const targetDir = isImage ? this.imagesDir : this.videosDir;
        const filePath = path.join(targetDir, fileName);

        try {
            // Enhanced download with retry and better error handling
            const response = await this.retryOperation(
                () => axios.get(attachment.url, {
                    responseType: 'arraybuffer',
                    timeout: 60000, // Increased timeout for slow connections
                    validateStatus: (status) => status < 400 // Accept any 2xx/3xx status
                }),
                `download attachment ${fileName}`,
                true // Use longer delays for file downloads
            );

            await fs.writeFile(filePath, response.data);

            if (isImage) {
                this.stats.imagesSaved++;
                console.log(`   📸 Image: ${fileName}`);
            } else {
                this.stats.videosSaved++;
                console.log(`   🎬 Video: ${fileName}`);
            }

            this.stats.newMessages++;

        } catch (error) {
            console.error(`   ❌ Failed to download ${fileName}:`, error.message);
            this.stats.errors++;

            // Save failed download info for retry later
            const failedDownload = {
                url: attachment.url,
                fileName,
                timestamp: new Date().toISOString(),
                error: error.message,
                messageId: message.id
            };

            await this.logFailedDownload(failedDownload);
        }
    }

    async logFailedDownload(failedDownload) {
        try {
            const failedDownloadsFile = path.join(__dirname, 'failed_downloads.json');
            let failedDownloads = [];

            if (await fs.pathExists(failedDownloadsFile)) {
                failedDownloads = await fs.readJson(failedDownloadsFile);
            }

            failedDownloads.push(failedDownload);
            await fs.writeJson(failedDownloadsFile, failedDownloads, { spaces: 2 });
        } catch (error) {
            console.error('❌ Failed to log failed download:', error.message);
        }
    }

    async retryOperation(operation, operationName, useLongDelay = false) {
        let lastError;

        for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
            try {
                const result = await operation();

                // Reset connection state on success
                if (attempt > 0) {
                    console.log(`   ✅ ${operationName} succeeded on attempt ${attempt + 1}`);
                    this.stats.retries++;
                }

                return result;

            } catch (error) {
                lastError = error;

                if (attempt < this.retryConfig.maxRetries) {
                    const delay = this.calculateDelay(attempt, useLongDelay);
                    console.log(`   🔄 ${operationName} failed, retrying in ${delay/1000}s (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`);
                    console.log(`      Error: ${error.message}`);

                    await this.sleep(delay);
                } else {
                    console.error(`   ❌ ${operationName} failed after ${this.retryConfig.maxRetries + 1} attempts`);
                    this.stats.errors++;
                }
            }
        }

        throw lastError;
    }

    calculateDelay(attempt, useLongDelay = false) {
        const baseDelay = useLongDelay ? this.retryConfig.baseDelay * 2 : this.retryConfig.baseDelay;
        const delay = Math.min(
            baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
            this.retryConfig.maxDelay
        );

        // Add jitter to prevent thundering herd
        return delay + Math.random() * 1000;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    timestampToSnowflake(timestamp) {
        // Discord's epoch: January 1, 2015
        const discordEpoch = 1420070400000;
        return ((timestamp - discordEpoch) << 22).toString();
    }

    printStats() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 ENHANCED DISCORD MEDIA DOWNLOAD COMPLETE');
        console.log('='.repeat(70));
        console.log(`Total messages scanned: ${this.stats.totalMessages}`);
        console.log(`New messages with media: ${this.stats.newMessages}`);
        console.log(`📸 Images saved: ${this.stats.imagesSaved}`);
        console.log(`🎬 Videos saved: ${this.stats.videosSaved}`);
        console.log(`🔄 Successful retries: ${this.stats.retries}`);
        console.log(`❌ Total errors: ${this.stats.errors}`);
        console.log(`🌐 Connection errors: ${this.stats.connectionErrors}`);
        console.log(`\n📁 Images saved to: ${this.imagesDir}`);
        console.log(`📁 Videos saved to: ${this.videosDir}`);
        console.log('='.repeat(70));
    }
}

const downloader = new DiscordMediaDownloaderEnhanced();
downloader.init().catch(console.error);