# Technical Context

## Technologies Used

### Core Technologies
- TypeScript
- Obsidian API
- Node.js
- esbuild (for bundling)
- Web Audio API
- MediaRecorder API

### AI Services
1. OpenAI
   - Whisper API for transcription
   - GPT models for summarization
   - API key required
   - Bearer token authentication

2. Groq
   - Alternative transcription provider
   - Language models for summarization
   - API key required
   - Faster processing capabilities

### Development Tools
- ESLint for code quality
- npm for package management
- Git for version control
- TypeScript compiler
- Web APIs for audio/video

### Dependencies
```json
{
  "@ffmpeg/ffmpeg": "^0.12.6",
  "@ffmpeg/util": "^0.12.1",
  "axios": "^1.7.7",
  "commander": "^12.1.0",
  "dotenv": "^16.4.5",
  "openai": "^4.79.1",
  "recordrtc": "^5.6.2"
}
```

## Development Setup
1. Build System
   ```json
   "scripts": {
     "dev": "node esbuild.config.mjs",
     "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
     "version": "node version-bump.mjs && git add manifest.json versions.json"
   }
   ```

2. Project Structure
   - Source code in `src/`
   - Built files in `build/`
   - Plugin manifest in root
   - Styles in `styles.css`
   - Settings in dedicated folder
   - Modular component organization

3. Development Requirements
   - Node.js environment
   - TypeScript understanding
   - Obsidian API knowledge
   - Web Audio API familiarity
   - AI API documentation

## Technical Constraints

### API Requirements
1. OpenAI
   - Valid API key required
   - Proper authentication headers
   - Rate limits apply
   - Model availability checks
   - Error handling for quotas

2. Groq
   - Valid API key required
   - Endpoint must be accessible
   - Service availability dependent
   - Model compatibility checks
   - Response format handling

### Browser APIs
1. Audio Processing
   - MediaRecorder for recording
   - Web Audio API for processing
   - AudioContext for manipulation
   - Blob handling for storage
   - Format conversion support

2. Video Processing
   - FFmpeg for extraction
   - Format detection
   - Codec support
   - Memory management
   - Processing optimization

3. File System
   - Access to Obsidian vault
   - Permission to create/modify files
   - Audio file handling
   - Video file handling
   - Directory management

### Performance
1. Audio Processing
   - Efficient chunking
   - Memory-conscious operations
   - Background processing
   - State management
   - Error recovery

2. Video Handling
   - Optimized extraction
   - Format conversion
   - Resource management
   - Progress tracking
   - Error handling

3. UI Responsiveness
   - Async operations
   - Progress indicators
   - State updates
   - Error feedback
   - Resource cleanup

### Security Considerations
1. API Keys
   - Secure storage in settings
   - No exposure in logs/errors
   - Validation before use
   - Encrypted transmission
   - Access control

2. File Operations
   - Safe file paths
   - Proper error handling
   - Data integrity checks
   - Permission validation
   - Resource cleanup

3. Data Management
   - Secure storage
   - State persistence
   - Cache management
   - Memory cleanup
   - Error recovery
