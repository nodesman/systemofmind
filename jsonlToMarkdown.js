import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url'; // For ESM compatibility if needed for pathing

/**
 * Sanitizes a string to be used as a filename.
 * @param {string} name - The string to sanitize.
 * @param {number} maxLength - Maximum length of the sanitized name (before extension).
 * @returns {string} - A sanitized string suitable for use as a filename, or empty if input is unsuitable.
 */
function sanitizeFilename(name, maxLength = 100) {
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return ''; // Indicates to use a default/sequential name
    }
    let sane = name.trim();
    // Replace problematic characters with underscore. Allows letters, numbers, underscore, dot, hyphen.
    sane = sane.replace(/[^a-z0-9_.-]/gi, '_');
    // Replace multiple underscores with a single underscore
    sane = sane.replace(/_{2,}/g, '_');
    // Remove leading/trailing underscores and dots that might cause issues
    sane = sane.replace(/^[_.]+|[_.]+$/g, '');
    
    // Truncate if too long (before extension)
    if (sane.length > maxLength) {
        sane = sane.substring(0, maxLength);
        // Ensure it doesn't end with an underscore or dot after truncation
        sane = sane.replace(/[_.]+$/g, '');
    }
    // If empty after sanitization (e.g., title was "???")
    if (sane.trim() === '' || sane.trim() === '_') {
        return ''; // Indicates to use default/sequential name
    }
    return sane.toLowerCase(); // Often good practice for filenames
}

/**
 * Processes a JSONL file and converts each line (JSON object) into a Markdown file.
 * @param {string} inputJsonlPath - Path to the input JSONL file.
 * @param {string} outputDirPath - Path to the directory where Markdown files will be saved.
 */
async function processJsonlToMarkdown(inputJsonlPath, outputDirPath) {
    console.log(`Input JSONL file: ${inputJsonlPath}`);
    console.log(`Output directory: ${outputDirPath}`);

    // 1. Ensure output directory exists
    if (!fs.existsSync(outputDirPath)) {
        console.log(`Creating output directory: ${outputDirPath}`);
        fs.mkdirSync(outputDirPath, { recursive: true });
    }

    // 2. Open readline interface for the input JSONL file
    const fileStream = fs.createReadStream(inputJsonlPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    let recordIndex = 0; // For default filenames and counting processed records
    let successfullyWrittenFiles = 0;
    let failedParses = 0;
    const baseFilenameCounts = {}; // To handle duplicate base filenames, e.g., { "my_doc": 2 }

    // 3. Loop `for await (const line of rl)`
    for await (const line of rl) {
        if (line.trim() === '') {
            // console.log(`Skipping empty line at index ${recordIndex}.`);
            continue; // Skip empty lines
        }

        let record;
        try {
            record = JSON.parse(line);
        } catch (error) {
            console.warn(`⚠️ Skipping invalid JSON on line ${recordIndex + 1}: ${error.message}. Line: "${line.substring(0, 100)}..."`);
            recordIndex++;
            failedParses++;
            continue;
        }

        // 4. Determine filename
        let baseNameProposal = '';
        if (record.title && typeof record.title === 'string') {
            baseNameProposal = sanitizeFilename(record.title);
        }
        // If title didn't produce a valid filename or wasn't there, try id
        if (!baseNameProposal && record.id) {
            const idStr = String(record.id); // ID might be a number
            const sanitizedId = sanitizeFilename(idStr);
            if (sanitizedId) {
                baseNameProposal = sanitizedId;
            }
        }
        // If still no baseName, use sequential record name
        if (!baseNameProposal) {
            baseNameProposal = `record_${recordIndex + 1}`;
        }

        let finalFilename;
        let counter = baseFilenameCounts[baseNameProposal] || 0;
        do {
            const suffix = counter === 0 ? '' : `_${counter}`;
            finalFilename = `${baseNameProposal}${suffix}.md`;
            counter++;
        } while (fs.existsSync(path.join(outputDirPath, finalFilename)));
        
        baseFilenameCounts[baseNameProposal] = counter; // Update count for this base name

        // 5. Generate markdown content
        let markdownContent = '';
        if (record.title && typeof record.title === 'string') {
            markdownContent += `# ${record.title}\n\n`;
        }

        if (record.messages && Array.isArray(record.messages)) {
            for (const message of record.messages) {
                if (message && typeof message.role === 'string' && typeof message.content !== 'undefined') {
                    const role = message.role.charAt(0).toUpperCase() + message.role.slice(1);
                    markdownContent += `**${role}:**\n${message.content}\n\n`;
                }
            }
        } else if (typeof record.prompt === 'string' && typeof record.completion === 'string') {
            markdownContent += `**User (Prompt):**\n${record.prompt}\n\n`;
            markdownContent += `**Assistant (Completion):**\n${record.completion}\n\n`;
        } else if (typeof record.text === 'string') {
            markdownContent += record.text + '\n\n';
        } else if (Object.keys(record).length > 0) {
            // Fallback for other structures
            if (!markdownContent.startsWith('#') && !record.title) { // Add a default title if none from record.title
                 markdownContent += `# Record Data (${baseNameProposal})\n\n`;
            }
            markdownContent += '```json\n';
            markdownContent += JSON.stringify(record, null, 2);
            markdownContent += '\n```\n'; // Closing the code block
        } else {
            // If record is empty or has no recognized fields, create an empty file or a file with a note
            if (!markdownContent.startsWith('#') && !record.title) {
                markdownContent += `# Empty Record (${baseNameProposal})\n\n`;
            }
            markdownContent += "This record was empty or contained no recognizable fields.\n";
        }

        // 6. Write the markdown file
        const outputFilePath = path.join(outputDirPath, finalFilename);
        try {
            fs.writeFileSync(outputFilePath, markdownContent, 'utf8');
            // console.log(`📝 Successfully wrote: ${outputFilePath}`); // Can be verbose
            successfullyWrittenFiles++;
        } catch (error) {
            console.error(`❌ Error writing file ${outputFilePath}: ${error.message}`);
        }
        recordIndex++;
    }

    console.log("\n--- Processing Summary ---");
    console.log(`Total lines/records processed (excluding empty): ${recordIndex}`);
    console.log(`Successfully written Markdown files: ${successfullyWrittenFiles}`);
    if (failedParses > 0) {
        console.log(`Lines skipped due to JSON parsing errors: ${failedParses}`);
    }
    console.log("--- Done ---");
}

// --- Main Execution ---
async function main() {
    const args = process.argv.slice(2); // Skip node executable and script path

    if (args.length !== 2) {
        console.error('Usage: node jsonlToMarkdown.js <input_jsonl_file_path> <output_directory_path>');
        console.error('Example: node jsonlToMarkdown.js ./my_data.jsonl ./markdown_output');
        process.exit(1);
    }

    const inputJsonlPath = args[0];
    const outputDirPath = args[1];

    if (!fs.existsSync(inputJsonlPath)) {
        console.error(`❌ Error: Input JSONL file not found at "${inputJsonlPath}"`);
        process.exit(1);
    }
    if (!fs.statSync(inputJsonlPath).isFile()) {
        console.error(`❌ Error: Input path "${inputJsonlPath}" is not a file.`);
        process.exit(1);
    }


    try {
        await processJsonlToMarkdown(inputJsonlPath, outputDirPath);
    } catch (error) {
        console.error(`❌ An unexpected error occurred during processing: ${error.message}`);
        console.error(error.stack); // For more detailed debugging
        process.exit(1);
    }
}

main();