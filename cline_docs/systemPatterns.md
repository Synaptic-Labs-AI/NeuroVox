# System Patterns

## Architecture Overview
The plugin follows a modular architecture with clear separation of concerns:

### Core Components
1. Main Plugin Class (NeuroVoxPlugin)
   - Central orchestrator
   - Manages plugin lifecycle
   - Handles plugin initialization
   - Coordinates between components
   - Manages UI state

2. AI Adapters
   - Abstract AIAdapter base class
   - Concrete implementations:
     - OpenAIAdapter
     - GroqAdapter
   - Handles API communication
   - Validates API keys
   - Supports multiple model types

3. Processing Components
   - RecordingProcessor: Handles audio processing
   - VideoProcessor: Manages video transcription
   - Supports chunking and concatenation
   - Implements error recovery
   - Manages file operations

4. UI Components
   - FloatingButton: Recording button in notes
   - ToolbarButton: Recording button in toolbar
   - RecordingUI: Recording interface
   - TimerModal: Recording timer display
   - AudioFileSuggestModal: File selection with fuzzy search

5. Settings Management
   - Settings storage and retrieval
   - API key configuration
   - UI preferences
   - Recording options
   - Summary configuration
   - Callout formatting

### Key Patterns
1. Singleton Pattern
   - Used for RecordingProcessor
   - Used for VideoProcessor
   - Ensures single instance for resource management
   - Maintains consistent state

2. Adapter Pattern
   - AI service adapters
   - Abstracts provider-specific logic
   - Enables easy provider switching
   - Standardizes API interactions

3. Observer Pattern
   - Event handling for workspace changes
   - File system monitoring
   - Settings updates
   - Recording state management

4. Factory Pattern
   - AI adapter creation
   - UI component initialization
   - Processing component instantiation

5. Strategy Pattern
   - Transcription provider selection
   - Summary generation approaches
   - File processing strategies

6. Command Pattern
   - Recording operations
   - File processing commands
   - UI interactions

## Technical Architecture
1. File Structure
   ```
   src/
   ├── adapters/         # AI service adapters
   ├── modals/          # Modal dialogs
   ├── settings/        # Settings management
   │   └── accordions/  # Settings sections
   ├── ui/             # User interface components
   ├── utils/          # Utility functions
   ├── main.ts         # Plugin entry point
   └── types.ts        # Type definitions
   ```

2. Data Flow
   - User Input → UI Components
   - UI → Recording/Video Processor
   - Processor → AI Adapter
   - AI Response → Document Embedding
   - Settings → Component Configuration

3. State Management
   - Settings stored in Obsidian config
   - Runtime state in plugin instance
   - Processing state in processors
   - UI state in component classes
   - Error state handling

4. Error Handling
   - Descriptive error messages
   - User-friendly notifications
   - Graceful fallbacks
   - Retry mechanisms
   - State recovery

## Development Patterns
1. Error Handling
   - Try-catch blocks with recovery
   - Error propagation
   - User notifications
   - State cleanup
   - Retry mechanisms

2. Code Organization
   - Modular component structure
   - Clear separation of concerns
   - TypeScript for type safety
   - Interface-based design
   - Dependency injection

3. Testing Approach
   - Manual testing of recordings
   - API validation checks
   - UI interaction testing
   - Error scenario testing
   - Performance monitoring

4. Performance Optimization
   - Chunked file processing
   - Async operations
   - Memory management
   - Resource cleanup
   - State persistence
