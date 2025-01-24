# Technical Context

## Technologies Used

### Core Technologies
- TypeScript
- Obsidian API
- Node.js
- esbuild (for bundling)

### AI Services
1. OpenAI
   - Whisper API for transcription
   - API key required
   - Bearer token authentication

2. Groq
   - Alternative transcription provider
   - API key required
   - Faster processing capabilities

### Development Tools
- ESLint for code quality
- npm for package management
- Git for version control

## Development Setup
1. Build System
   ```json
   "scripts": {
     "build": "tsc && node -e \"require('fs').chmodSync('build/index.js', '755')\""
   }
   ```

2. Project Structure
   - Source code in `src/`
   - Built files in `build/`
   - Plugin manifest in root
   - Styles in `styles.css`

3. Dependencies
   - Obsidian API
   - OpenAI client
   - Groq client
   - Audio processing libraries

## Technical Constraints

### API Requirements
1. OpenAI
   - Valid API key required
   - Proper authentication headers
   - Rate limits apply

2. Groq
   - Valid API key required
   - Endpoint must be accessible
   - Service availability dependent

### Plugin Requirements
1. File System
   - Access to Obsidian vault
   - Permission to create/modify files
   - Audio file handling capabilities

2. Browser APIs
   - MediaRecorder for audio capture
   - Web Audio API for processing
   - Blob handling for file operations

3. Performance
   - Efficient audio processing
   - Responsive UI
   - Background processing support

### Security Considerations
1. API Keys
   - Secure storage in settings
   - No exposure in logs/errors
   - Validation before use

2. File Operations
   - Safe file paths
   - Proper error handling
   - Data integrity checks
