#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BalancedImageSchwepeAnalyzer {
    constructor() {
        this.apiEndpoint = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
        this.apiToken = process.env.ANTHROPIC_AUTH_TOKEN;
        this.imagesDir = path.join(__dirname, 'saved_images');
        this.deletedDir = path.join(__dirname, 'deleted_images');

        this.stats = {
            total: 0,
            schwepe: 0,
            notSchwepe: 0,
            errors: 0,
            deleted: []
        };
    }

    async init() {
        console.log('🐸 BALANCED Image Schwepe Analyzer - Smart Detection');
        console.log('🔥 Analyzing images with balanced Schwepe detection...\n');

        await fs.ensureDir(this.deletedDir);

        if (!this.apiToken) {
            throw new Error('ANTHROPIC_AUTH_TOKEN environment variable not found');
        }

        if (!await fs.pathExists(this.imagesDir)) {
            throw new Error(`Images directory not found: ${this.imagesDir}`);
        }
    }

    async analyzeImage(imagePath) {
        try {
            const fileName = path.basename(imagePath);
            console.log(`🔍 Analyzing: ${fileName}`);

            // Removed automatic filename filtering to focus on content-based analysis only

            // Read and encode image
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');
            const mimeType = `image/${path.extname(imagePath).substring(1).toLowerCase()}`;
            const imageData = `data:${mimeType};base64,${base64Image}`;

            // Create balanced analysis prompt
            const prompt = this.createBalancedAnalysisPrompt();

            // Call GLM-4.5V API
            const response = await axios.post(this.apiEndpoint, {
                model: 'glm-4.5v',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: prompt
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageData
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 800,
                temperature: 0.2
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 120000
            });

            const analysis = response.data.choices[0].message.content;
            let isSchwepe = this.interpretAnalysis(analysis);
            const confidence = this.extractConfidence(analysis);

            // Apply strict confidence threshold for Schwepe detection
            if (isSchwepe && confidence < 7) {
                isSchwepe = false;
                console.log(`⚠️  Low confidence (${confidence}/10) - treating as NOT SCHWEPE`);
            }

            return {
                imagePath,
                isSchwepe,
                analysis,
                confidence
            };

        } catch (error) {
            console.error(`❌ Error analyzing ${path.basename(imagePath)}:`, error.message);
            return {
                imagePath,
                isSchwepe: false,
                analysis: `Error: ${error.message}`,
                confidence: 0,
                error: true
            };
        }
    }

    createBalancedAnalysisPrompt() {
        return `You are analyzing images for "Schwepe" meme token content using BALANCED, FLEXIBLE detection.

## CORE SCHWEPE CHARACTERISTICS (ANY of these can trigger Schwepe detection):
🐸 **CLEAR FROG/AMPHIBIAN**: Obvious frog, toad, amphibian character, frog faces, amphibian creatures = AUTOMATIC SCHWEPE
🌈 **PINK/PURPLE THEME**: Pink/purple dominant colors, neon schemes, vibrant purple aesthetics = STRONG SCHWEPE
🕶️ **SHINY REFLECTIVE ELEMENTS**: Sunglasses, shiny eyes, glossy surfaces, reflective materials, metallic finishes = STRONG SCHWEPE
🎨 **AI-MEME AESTHETIC**: AI-generated art, meme format, stylized digital art, internet culture aesthetics = STRONG SCHWEPE

## ENHANCED SCHWEPE DETECTION RULES:
✅ **AUTOMATIC SCHWEPE**: Any single core characteristic is sufficient
✅ **FROG-FOCUSED**: Clear frog/amphibian characters = AUTOMATIC SCHWEPE (no other criteria needed)
✅ **THEME-COMBINATION**: Pink/purple + frogs OR Pink/purple + shiny elements = AUTOMATIC SCHWEPE
✅ **MEME-COMBINATION**: Any meme aesthetic + one other characteristic = AUTOMATIC SCHWEPE
✅ **CHARACTER-BASED**: Stylized characters with thematic elements = SCHWEPE

## NOT SCHWEPE CONTENT:
❌ **NO FROGS/AMPHIBIANS**: Generic images without amphibian characters = NOT SCHWEPE
❌ **SCREENSHOTS/UI**: Screenshots, user interfaces, social media captures = NOT SCHWEPE
❌ **PHOTOGRAPHS**: Real photos, even edited, unless they have clear Schwepe elements = NOT SCHWEPE
❌ **GENERIC CONTENT**: Random images without meme/thematic elements = NOT SCHWEPE
❌ **TEXT-ONLY**: Just text without proper character/art elements = NOT SCHWEPE

## ANALYSIS FOCUS:
🎯 **FROG DETECTION**: Look for any frog-like creatures, amphibians, frog faces, characters
🎯 **COLOR ANALYSIS**: Identify pink/purple dominance, neon schemes, vibrant colors
🎯 **SHINY ELEMENTS**: Find sunglasses, reflective eyes, glossy surfaces, metallic finishes
🎯 **ART STYLE**: Assess AI generation, meme format, digital art, internet culture

## EXAMPLES:
- Pink/purple frog character = AUTOMATIC SCHWEPE ✅
- Frog with any shiny elements = AUTOMATIC SCHWEPE ✅
- AI meme art with pink/purple theme = SCHWEPE ✅
- Frog character in meme format = AUTOMATIC SCHWEPE ✅
- Generic landscape photo = NOT SCHWEPE ❌
- Screenshot of social media = NOT SCHWEPE ❌

## RESPONSE FORMAT:
SCHWEPE_RELATED: [YES/NO]
CONFIDENCE: [1-10]
FROGS_OR_AMPHIBIANS: [YES/NO]
PINK_PURPLE_THEME: [YES/NO]
SHINY_ELEMENTS: [YES/NO]
MEME_INDICATORS: [YES/NO]
REASONING: [Explain why this should or shouldn't be Schwepe based on the flexible criteria]`;
    }

    interpretAnalysis(analysis) {
        const lines = analysis.split('\n');
        const schwepeLine = lines.find(line => line.toLowerCase().includes('schwepe_related'));

        if (!schwepeLine) return false;

        const value = schwepeLine.split(':')[1]?.trim().toUpperCase();
        return value === 'YES';
    }

    extractConfidence(analysis) {
        const lines = analysis.split('\n');
        const confidenceLine = lines.find(line => line.toLowerCase().includes('confidence'));

        if (!confidenceLine) return 5;

        const value = confidenceLine.split(':')[1]?.trim();
        return parseInt(value) || 5;
    }

    async processImages() {
        const imageFiles = await this.getImageFiles();

        if (imageFiles.length === 0) {
            console.log('📁 No images found in', this.imagesDir);
            return;
        }

        console.log(`📊 Found ${imageFiles.length} images to analyze\n`);
        this.stats.total = imageFiles.length;

        // Process images in batches to avoid API limits
        const batchSize = 5;
        for (let i = 0; i < imageFiles.length; i += batchSize) {
            const batch = imageFiles.slice(i, i + batchSize);

            console.log(`🔄 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(imageFiles.length/batchSize)}`);

            const results = await Promise.all(
                batch.map(imagePath => this.analyzeImage(imagePath))
            );

            // Handle results
            for (const result of results) {
                this.handleAnalysisResult(result);
            }

            // Small delay between batches
            if (i + batchSize < imageFiles.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        this.printFinalStats();
    }

    handleAnalysisResult(result) {
        const fileName = path.basename(result.imagePath);

        if (result.error) {
            this.stats.errors++;
            console.log(`❌ ${fileName} - Analysis failed`);
            return;
        }

        // Extract additional info from analysis
        const hasFrogs = this.checkForCharacteristic(result.analysis, 'FROGS_OR_AMPHIBIANS');
        const hasPinkPurple = this.checkForCharacteristic(result.analysis, 'PINK_PURPLE_THEME');
        const hasShinyElements = this.checkForCharacteristic(result.analysis, 'SHINY_ELEMENTS');
        const hasMemeIndicators = this.checkForCharacteristic(result.analysis, 'MEME_INDICATORS');

        if (result.isSchwepe) {
            this.stats.schwepe++;
            let message = `✅ ${fileName} - SCHWEPE (confidence: ${result.confidence}/10)`;
            const attributes = [];
            if (hasFrogs) attributes.push('🐸 FROGS');
            if (hasPinkPurple) attributes.push('🌈 PINK/PURPLE');
            if (hasShinyElements) attributes.push('🕶️ SHINY ELEMENTS');
            if (hasMemeIndicators) attributes.push('😂 MEME');
            if (attributes.length > 0) {
                message += ` [${attributes.join(', ')}]`;
            }
            console.log(message);
        } else {
            this.stats.notSchwepe++;
            console.log(`🗑️  ${fileName} - NOT SCHWEPE (confidence: ${result.confidence}/10)`);

            // Delete non-Schwepe images
            this.deleteNonSchwepeImage(result.imagePath, fileName, result.analysis);
        }
    }

    checkForCharacteristic(analysis, characteristic) {
        const lines = analysis.split('\n');
        const line = lines.find(line => line.toLowerCase().includes(characteristic.toLowerCase()));
        return line && line.split(':')[1]?.trim().toUpperCase() === 'YES';
    }

    async deleteNonSchwepeImage(imagePath, fileName, analysis) {
        try {
            // Move to deleted directory
            const deletedPath = path.join(this.deletedDir, fileName);
            await fs.move(imagePath, deletedPath, { overwrite: true });

            this.stats.deleted.push(fileName);

            // Save analysis reason
            const analysisFile = path.join(this.deletedDir, `${fileName}.analysis.txt`);
            await fs.writeFile(analysisFile, `Deleted reason:\n${analysis}`);

            console.log(`   📁 Moved to deleted_images/`);

        } catch (error) {
            console.error(`   ❌ Failed to delete ${fileName}:`, error.message);
        }
    }

    async getImageFiles() {
        const files = await fs.readdir(this.imagesDir);
        return files
            .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
            .map(file => path.join(this.imagesDir, file))
            .sort();
    }

    printFinalStats() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 BALANCED IMAGE SCHWEPE ANALYSIS COMPLETE');
        console.log('='.repeat(70));
        console.log(`Total images analyzed: ${this.stats.total}`);
        console.log(`✅ Schwepe-related: ${this.stats.schwepe}`);
        console.log(`🗑️  Not Schwepe (deleted): ${this.stats.notSchwepe}`);
        console.log(`❌ Analysis errors: ${this.stats.errors}`);

        if (this.stats.deleted.length > 0) {
            console.log('\n🗑️  DELETED IMAGES:');
            this.stats.deleted.slice(-10).forEach(file => {
                console.log(`   • ${file}`);
            });
            if (this.stats.deleted.length > 10) {
                console.log(`   ... and ${this.stats.deleted.length - 10} more`);
            }
        }

        console.log(`\n📁 Deleted images moved to: ${this.deletedDir}`);
        console.log(`🎯 Schwepe retention rate: ${((this.stats.schwepe / this.stats.total) * 100).toFixed(1)}%`);
        console.log('='.repeat(70));
    }

    async run() {
        try {
            await this.init();
            await this.processImages();
        } catch (error) {
            console.error('💥 Fatal error:', error.message);
            process.exit(1);
        }
    }
}

// Run the analyzer
if (import.meta.url === `file://${process.argv[1]}`) {
    const analyzer = new BalancedImageSchwepeAnalyzer();
    analyzer.run().catch(console.error);
}

export default BalancedImageSchwepeAnalyzer;