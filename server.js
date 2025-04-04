// --- Environment Variables ---
// Load environment variables (like API keys) from a .env file into process.env
// This keeps sensitive information out of the source code.
require('dotenv').config();

// --- Dependencies ---
// Import necessary libraries (Node.js modules)
const express = require('express'); // Web server framework
const cors = require('cors'); // Middleware for enabling Cross-Origin Resource Sharing
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai'); // Google AI SDK
const fs = require('fs').promises; // File system module (using promises for async operations)
const path = require('path'); // Module for working with file and directory paths

// --- Express App Setup ---
const app = express(); // Create an Express application instance
const port = process.env.PORT || 3000; // Define the port the server will listen on. Use environment variable PORT if available (common on hosting platforms like Render), otherwise default to 3000.

// --- Middleware Configuration ---
// Middleware functions run for every incoming request before it reaches the route handlers.

// Enable CORS: Allows requests from different origins (like your Shopify store frontend)
// to access this backend API. Without this, browsers would block such requests for security reasons.
app.use(cors());

// Enable JSON Body Parsing: Parses incoming requests with JSON payloads (like the user input from our frontend form)
// and makes the data available on req.body.
app.use(express.json());

// Serve Static Files: Tells Express to serve static files (HTML, CSS, JavaScript, images)
// directly from the specified directory (__dirname is the current directory where server.js lives).
// This allows the browser to load index.html, style.css, script.js etc.
app.use(express.static(path.join(__dirname)));

// --- Global Variables ---
// Variables to hold the Google AI client and model, initialized later.
let genAI;
let model;
// Variable to hold the loaded supplement data.
let supplements = [];
const supplementsPath = path.join(__dirname, 'supplements.json'); // Path to the supplement data file.

// --- Function to Load Supplement Data ---
// Asynchronously reads and parses the supplements.json file.
async function loadSupplements() {
    try {
        const data = await fs.readFile(supplementsPath, 'utf8'); // Read the file content as text
        supplements = JSON.parse(data); // Parse the JSON text into a JavaScript array/object
        console.log(`Supplement data loaded successfully (${supplements.length} products).`);
    } catch (error) {
        console.error("Error loading supplement data from supplements.json:", error);
        // If loading fails, log the error and continue with an empty supplements array.
        // Consider if the application should stop if supplements are critical.
        supplements = [];
    }
}

// --- Function to Initialize Google AI SDK ---
// Initializes the Google AI client using the API key from environment variables.
// Moved initialization here to ensure dotenv has loaded the key first.
function initializeGoogleAI() {
    const apiKey = process.env.GOOGLE_API_KEY; // Get the API key from environment variables
    // Check if the API key is missing or is still the placeholder value.
    if (!apiKey || apiKey === 'YOUR_GOOGLE_API_KEY_HERE') {
        console.error("ERROR: GOOGLE_API_KEY is not set or is still the placeholder in the .env file. API calls will fail.");
        // Set genAI and model to null so the API endpoint check fails gracefully.
        genAI = null;
        model = null;
    } else {
        try {
            // Create a new GoogleGenerativeAI instance with the API key.
            genAI = new GoogleGenerativeAI(apiKey);
            // Get a specific generative model instance (e.g., 'gemini-1.5-flash-latest').
            // You might change the model name based on availability and desired capability/cost.
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
            console.log("Google AI SDK initialized successfully.");
        } catch (error) {
             // Log any errors during SDK initialization.
             console.error("Error initializing Google AI SDK:", error);
             genAI = null;
             model = null;
        }
    }
}

// --- Helper Functions ---

// Function to select relevant supplements based on user input.
// This is a basic implementation and can be significantly improved for better relevance.
function selectSupplements(userInput, count = 3) {
    // Return empty array if supplement data failed to load.
    if (!supplements || supplements.length === 0) {
        return [];
    }

    // --- Simple Filtering Logic ---
    // 1. Filter by matching the user's primary goal.
    let relevantSupplements = supplements.filter(sup =>
        sup.goals && sup.goals.includes(userInput.goal)
    );

    // 2. If not enough found, add supplements tagged for 'overall_fitness' (avoiding duplicates).
    if (relevantSupplements.length < count) {
         const overallFitnessSupps = supplements.filter(sup =>
            sup.goals && sup.goals.includes('overall_fitness') && !relevantSupplements.some(rs => rs.name === sup.name)
        );
        // Combine the goal-specific and overall fitness supplements.
        relevantSupplements = [...relevantSupplements, ...overallFitnessSupps];
    }

     // 3. If still not enough, add from the remaining general pool (avoiding duplicates).
     if (relevantSupplements.length < count) {
         const generalSupps = supplements.filter(sup => !relevantSupplements.some(rs => rs.name === sup.name));
         relevantSupplements = [...relevantSupplements, ...generalSupps];
     }
     // --- End Simple Filtering ---

    // Shuffle the relevant supplements randomly to provide variety.
    // A more sophisticated approach could rank them based on goal, sub-focus keywords, etc.
    const shuffled = relevantSupplements.sort(() => 0.5 - Math.random());
    // Return the requested number of supplements (default 3).
    return shuffled.slice(0, count);
}

// Function to format the selected supplement details into text for the AI prompt.
function formatSupplementsForPrompt(selectedSupps) {
    // Handle case where no supplements were selected.
    if (!selectedSupps || selectedSupps.length === 0) {
        return "No specific supplements recommended based on current data.";
    }
    // Start building the text block for the prompt.
    let promptText = "Recommended HTC Supplements (Include these EXACTLY 3 recommendations formatted as specified in the output requirements):\n";
    // Add details for each selected supplement.
    selectedSupps.forEach(sup => {
        promptText += `- Product Name: ${sup.name}\n`;
        promptText += `  Description: ${sup.description}\n`;
        promptText += `  URL: ${sup.url}\n`;
        // Include other details from supplements.json that might help the AI tailor the recommendation text.
        promptText += `  Relevant Goals: ${sup.goals ? sup.goals.join(', ') : 'General Use'}\n`;
        promptText += `  Keywords: ${sup.benefits_keywords ? sup.benefits_keywords.join(', ') : 'N/A'}\n`;
        promptText += `  Suggested Timing: ${sup.timing || 'Refer to packaging'}\n`;
        promptText += `  Suggested Dosage: ${sup.dosage_note || 'Refer to packaging'}\n\n`;
    });
     // Add a final instruction reminding the AI about formatting and context.
     promptText += "Remember to explain the benefits specifically for the user's goal and selected sub-focus, and format the output exactly as requested (## RECOMMENDED SUPPLEMENTS block with ### for each product).";
    return promptText;
}


// Function to construct the main prompt string sent to the Google AI.
function buildPrompt(userInput, supplementPromptText) {
    // Use template literals (backticks ``) for easy multi-line string creation and variable embedding.
    return `User Profile:
- Fitness Goal: ${userInput.goal?.replace('_', ' ') || 'Not specified'}
- Experience Level: ${userInput.experience || 'Not specified'}
- Equipment Access: ${userInput.equipment?.replace('_', ' ') || 'Not specified'}
- Training Frequency: ${userInput.frequency || 'Not specified'} days per week
- Preferred Workout Duration: ${userInput.duration || 'Not specified'} minutes per session
- Focus Area: ${userInput.focusArea || 'Not specified'}
- Sub-Focus: ${userInput.subFocus || 'Not specified'}

Plan Requirements:
- Create a ${userInput.frequency || 'default'}-day weekly workout schedule tailored to the user's inputs.
- Each day must have a complete, distinct workout that primarily targets the selected sub-focus (${userInput.subFocus || 'Not specified'}). If no sub-focus is selected, create a balanced plan for the overall goal.
- Detail specific exercises for each training day. **IMPORTANT: Format EACH exercise EXACTLY like this example, using bullet points (•) for details:**
  ### EXERCISE NAME
  • Sets: [Number or Range, e.g., 3-4]
  • Reps/Time: [Number or Range, e.g., 8-12 reps or 30 seconds]
  • Rest: [Duration, e.g., 60-90 seconds]
  • Form Guidance: [Detailed guidance on proper execution, key points, and common mistakes to avoid.]
- Ensure rest periods are scientifically appropriate for the goal and exercise type.
- Provide concise, accurate form guidance within the specified "Form Guidance" field for key exercises to ensure safety and effectiveness.
- Maintain an authoritative, encouraging, and professional tone throughout. Focus on actionable advice and clear rationale grounded in exercise science.
- Ensure the plan is strictly based on established exercise science principles and aligns with the user's stated goal, experience level, and available equipment. Provide specific justifications for exercise choices or programming structure where appropriate.
- Format ALL major headings (like DAY 1, NUTRITION GUIDELINES, etc.) in ALL CAPS and centered. Use ## for section headings (left-aligned) and ### for subsections (left-aligned).
- Organize information in clearly defined, visually distinct blocks with adequate spacing. Use bold text for exercise names and important terms. Present lists using bullet points (•).
- Make the content compact yet highly readable with a clean visual hierarchy, suitable for easy scanning and printing.
- Label each day clearly (DAY 1, DAY 2, etc.) with precise workouts for each day.

Optional Components to Include:
${userInput.include_warmup ? '- General Warm-up Protocol (dynamic stretches, light cardio).' : ''}
${userInput.include_nutrition ? '- Provide specific, actionable nutrition strategies relevant to the primary fitness goal (e.g., evidence-based macronutrient targets for muscle hypertrophy, detailed calorie deficit planning for fat loss, nutrient timing considerations).' : ''}
${userInput.include_cooldown ? '- Include appropriate cool-down routines for each workout day.' : ''}
${userInput.include_progression ? '- Provide a scientifically-sound progression plan to advance beyond this initial program (e.g., double progression, RPE adjustments).' : ''}
- Conclude with a concise, professional summary emphasizing adherence, progressive overload (if applicable), and the importance of monitoring progress.

Additional Requirements:
- Ensure each generated workout plan is unique and scientifically valid, with varied exercises, structures, and approaches compared to previous generations for similar inputs. Use different progression models, rest strategies, and periodization concepts where appropriate.
- All information must be biologically correct and based on current exercise science. Avoid fitness myths.
- Include specific mechanism explanations for why certain exercises or techniques are recommended for the user's goal and sub-focus.
- Incorporate the HTC Supplements branding theme subtly, perhaps with references to "The Chamber" or high intensity.
- Include the motivational phrase: "The gravity is heavier, the air is thinner and the heat is rising - can you handle the chamber?" exactly once, perhaps near the end.
- Format the output with consistent visual blocks and clear visual separation between sections as specified.
- Prioritize exercises and programming that specifically target the selected sub-focus (${userInput.subFocus || 'Not specified'}). Ensure the daily workouts reflect this emphasis.
- Recommend exactly 3 HTC supplements using the details provided below. Format the recommendations precisely as requested in the output requirements.

${supplementPromptText}

Output Formatting Reminder:
- Main headings (like DAY 1): ALL CAPS, Centered
- Section headings (like ## WORKOUT DETAILS): Left-aligned
- Subsection headings (like ### Exercise Name): Left-aligned
- Use bold for emphasis (**Important Term**).
- Use bullet points (•) for lists.
- Ensure clear visual separation between days, exercises, and sections.
- The supplement block must start with ## RECOMMENDED SUPPLEMENTS and use ### for each product name.
`;
}


// --- API Endpoint Route Handler ---
// Defines the backend endpoint that the frontend JavaScript will call.
// app.post specifies that this endpoint listens for HTTP POST requests.
// '/api/generate-plan' is the path for the endpoint.
// async (req, res) => { ... } is the asynchronous function that handles the request.
// 'req' (request) contains information about the incoming request (including user input in req.body).
// 'res' (response) is used to send a response back to the client (the frontend).
app.post('/api/generate-plan', async (req, res) => {
    console.log("Received request to /api/generate-plan"); // Log when the endpoint is hit.

    // --- Pre-computation Check ---
    // Verify that the Google AI SDK was initialized correctly.
    if (!genAI || !model) {
         console.error("Google AI SDK not initialized. Check API Key.");
         // Send a 500 Internal Server Error response if the SDK isn't ready.
         return res.status(500).json({ error: "API configuration error. Cannot generate plan." });
    }

    // --- Input Validation ---
    const userInput = req.body; // Get the user input data sent from the frontend.
    console.log("User Input Received:", userInput); // Log the received input for debugging.

    // Basic check if input exists. More robust validation could be added here.
    if (!userInput || Object.keys(userInput).length === 0) {
        // Send a 400 Bad Request response if the input is missing or empty.
        return res.status(400).json({ error: "Invalid user input received." });
    }

    // --- Main Logic (Try...Catch block for error handling) ---
    try {
        // 1. Select Supplements based on user input.
        const selectedSupps = selectSupplements(userInput, 3);
        // Format the selected supplement details for inclusion in the main prompt.
        const supplementPromptText = formatSupplementsForPrompt(selectedSupps);
        console.log("Selected Supplements for Prompt:", selectedSupps.map(s=>s.name)); // Log names for debugging.

        // 2. Build the full prompt string using the user input and supplement text.
        const prompt = buildPrompt(userInput, supplementPromptText);
        // Uncomment the lines below to log the full prompt being sent to the AI (can be very long).
        // console.log("\n--- Sending Prompt to Google AI ---");
        // console.log(prompt);
        // console.log("--- End of Prompt ---");


        // 3. Call Google AI API
        console.log("Calling Google AI API...");
        // Configuration options for the generation process (optional).
        const generationConfig = {
            // temperature: 0.7, // Example: Adjust creativity (0=deterministic, 1=max creative)
            // maxOutputTokens: 4096, // Example: Limit response length
        };
         // Safety settings to filter harmful content. Adjust thresholds as needed.
         const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        ];

        // Start a chat session with the model (though we send a single message here).
        const chat = model.startChat({
            generationConfig,
            safetySettings,
            history: [], // Start with no prior history for each request.
        });

        // Send the prompt to the model and wait for the result.
        const result = await chat.sendMessage(prompt);
        // Extract the response content.
        const response = result.response;

        // --- Response Validation ---
        // Check if the response structure is valid.
        if (!response || !response.candidates || response.candidates.length === 0 || !response.candidates[0].content) {
             console.error("Invalid response structure from Google AI:", response);
             // Throw an error if the response is malformed.
             throw new Error("Received an invalid or empty response from the AI service.");
        }

        // Extract the generated text content from the response parts.
        const planText = response.candidates[0].content.parts.map(part => part.text).join('');
        console.log("Received response from Google AI."); // Log success.
        // Uncomment to log the raw AI response text for debugging.
        // console.log("--- AI Response Text ---");
        // console.log(planText);
        // console.log("--- End AI Response Text ---");


        // 4. Send Successful Response to Frontend
        // Send the generated plan text back to the frontend in a JSON object.
        res.json({ plan: planText });

    // --- Error Handling ---
    } catch (error) {
        // Log detailed error information if the API call or processing fails.
        console.error("Error during API call or processing:", error.message); // Log the primary error message.
        if (error.cause) {
             // Log the underlying cause if available (often contains network error details).
             console.error("Fetch Error Cause:", error.cause);
        }
        // Optionally log the full error object for deeper debugging:
        // console.error("Full Error Object:", error);

        // Send an appropriate error response back to the frontend.
        if (error.message.includes('SAFETY')) {
             // Specific error for content blocked by safety filters.
             res.status(500).json({ error: "Content generation blocked due to safety settings. Please adjust your input or contact support." });
        } else if (error.message.includes('API key') || (error.errorDetails && error.errorDetails.some(d => d.reason === 'API_KEY_INVALID'))) {
             // Specific error for invalid or expired API key issues.
             res.status(500).json({ error: "Server configuration error: Invalid or expired API Key." });
        } else if (error.message.includes('fetch failed')) {
             // Specific error for network/connection issues during the fetch.
             res.status(500).json({ error: "Network error communicating with AI service. Please check connection or try again later." });
        } else {
             // Generic error message for any other unexpected issues.
            res.status(500).json({ error: "Failed to generate fitness plan due to an internal server issue." });
        }
    }
});

// --- Root Route Handler ---
// Defines what happens when someone accesses the base URL (e.g., http://localhost:3000/).
// It sends the main index.html file to the browser.
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// --- Server Startup ---
// Load supplements and initialize the AI SDK *before* starting the server.
loadSupplements()
.then(initializeGoogleAI) // Initialize AI after loading supplements.
.then(() => {
    // Start the Express server and make it listen for incoming connections on the specified port.
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`); // Log confirmation that the server is running.
    });
}).catch(error => {
     // Catch any critical errors during startup (like supplement loading failure).
     console.error("Failed to initialize server:", error);
     process.exit(1); // Exit the process if server can't start properly.
});