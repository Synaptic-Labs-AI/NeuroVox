# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

NeuroVox is an Obsidian plugin that enhances note-taking with voice transcription and AI-powered insights. It supports multiple AI providers (OpenAI, Groq, Deepgram) for audio transcription and processing, with additional features for video-to-audio conversion and real-time recording.

## Key Features

- Voice recording with transcription via multiple AI services
- Video file processing (extracts audio for transcription)
- Chunk-based processing for large audio files
- Smart note formatting with timestamps and organization
- Floating button and toolbar integration for quick access
- Real-time recording timer display
- Multiple output modes (new note, clipboard, current note)

## Technical Stack

- **TypeScript** (ES6 target, ESNext modules)
- **Obsidian API** (min version 0.15.0)
- **Build Tool**: esbuild with hot reload
- **AI Services**: OpenAI, Groq, Deepgram APIs
- **Audio/Video**: RecordRTC, FFmpeg.wasm
- **State Management**: Custom state system in utils/state
- **Version**: 0.3.1 (manifest.json)

## Architecture Overview

### Core Components

1. **AI Adapters** (`src/adapters/`)
   - Base `AIAdapter` interface for consistent API
   - Provider-specific implementations (OpenAI, Groq, Deepgram)
   - Each adapter handles transcription and optional AI processing

2. **Audio Processing** (`src/utils/audio/`)
   - `AudioChunker`: Splits large audio files for processing
   - `AudioProcessor`: Handles recording and chunk management
   - `RecordingProcessor`: Orchestrates transcription workflow
   - Configurable bitrate and MIME type support

3. **State Management** (`src/utils/state/`)
   - `StateManager`: Global state tracking
   - `SegmentTracker`: Tracks processing segments
   - Persistent state across operations

4. **UI Components**
   - `FloatingButton`: Draggable recording button
   - `TimerModal`: Real-time recording interface
   - `RecordingUI`: Recording controls and status
   - Settings tab with accordions for organization

5. **Command System** (`src/commands/`)
   - Modular command registration
   - Supports various input methods (recording, files, clipboard)

### Design Patterns

- **Adapter Pattern**: Unified interface for multiple AI providers
- **Chunk Processing**: Handles large files by splitting into manageable segments
- **Event-Driven**: Uses Obsidian's event system for UI updates
- **Async/Await**: Throughout for API calls and file operations
- **Error Boundaries**: Comprehensive error handling with user feedback

## Project Structure

```
src/
├── adapters/           # AI service integrations
├── commands/           # Obsidian command implementations
├── main.ts            # Plugin entry point
├── modals/            # UI modal components
├── prompts/           # AI prompt templates
├── settings/          # Plugin configuration
├── types.ts           # TypeScript definitions
├── ui/                # UI components
└── utils/             # Utility modules
    ├── audio/         # Audio processing
    ├── document/      # Note manipulation
    ├── state/         # State management
    └── transcription/ # Transcription coordination
```

## Development Setup

### Build Scripts
```bash
# Development with hot reload
npm run dev

# Production build (includes TypeScript check)
npm run build

# Update version in manifest.json and versions.json
npm run version
```

### Build Configuration
- Uses `esbuild.config.mjs` for bundling
- Outputs to `main.js` in root directory
- Includes banner for Obsidian compatibility
- Development mode includes sourcemaps and watch

## Key APIs and Services

### OpenAI Integration
- Whisper API for transcription
- GPT models for content processing
- Requires API key in settings

### Groq Integration
- Fast inference for transcription
- Whisper-large-v3 model
- Requires API key in settings

### Deepgram Integration
- Real-time transcription service
- Nova-2 model support
- Recently integrated (commit c6decb4)

### Browser APIs
- MediaRecorder API for audio capture
- Web Audio API for processing
- FileReader API for file handling

## Technical Constraints

1. **File Size Limits**
   - Implements chunking for files > 25MB
   - Configurable chunk duration (default 300s)

2. **Browser Compatibility**
   - Requires modern browser with MediaRecorder support
   - WebAssembly support needed for FFmpeg

3. **API Rate Limits**
   - Respect provider-specific rate limits
   - Implements retry logic for transient failures

4. **Security**
   - API keys stored in Obsidian settings
   - No keys in code or version control
   - Sensitive data handled securely

## Recent Updates

- **Deepgram Integration**: Added new transcription provider with API key management
- **Enhanced Audio Processing**: Configurable bitrate and MIME type support
- **Chunked Processing**: Improved handling of large audio files
- **Version 0.3.1**: Latest release with multiple improvements

## Development Guidelines

1. **Follow Existing Patterns**
   - Use adapter pattern for new AI providers
   - Implement proper error handling with user feedback
   - Maintain TypeScript types in types.ts

2. **State Management**
   - Use StateManager for global state
   - Clean up state after operations
   - Handle edge cases (cancellation, errors)

3. **UI Consistency**
   - Follow Obsidian's UI patterns
   - Use modals for user interactions
   - Provide clear status feedback

4. **Performance**
   - Implement chunking for large files
   - Use async operations for IO
   - Clean up resources (audio contexts, etc.)

## Common Development Tasks

### Adding a New AI Provider
1. Create adapter in `src/adapters/`
2. Implement AIAdapter interface
3. Add settings in `src/settings/Settings.ts`
4. Update SettingTab UI
5. Register in TranscriptionService

### Modifying Audio Processing
- Check `src/utils/audio/` for core logic
- Update AudioProcessor for recording changes
- Modify AudioChunker for chunk handling

### Working with Settings
- Settings interface in `src/settings/Settings.ts`
- UI components in `src/settings/accordions/`
- Settings saved via Obsidian's data API

## Testing Approach

Currently no formal test suite. Test manually by:
1. Loading plugin in Obsidian development vault
2. Testing each transcription provider
3. Verifying chunk processing with large files
4. Checking all output modes (note, clipboard, etc.)

## Known Issues and Considerations

- No automated tests yet
- Version mismatch between package.json (0.2.0) and manifest.json (0.3.1)
- Desktop and mobile support (desktop-only: false)
- Requires manual API key configuration for each provider