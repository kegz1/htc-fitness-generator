// This event listener ensures that the JavaScript code runs only after the
// entire HTML document has been fully loaded and parsed. This prevents errors
// that could occur if the script tries to access HTML elements that don't exist yet.
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Element References ---
    // Get references to the HTML elements we need to interact with using their IDs.
    // Storing these in constants makes the code more readable and efficient.
    const form = document.getElementById('fitness-form'); // The main form element
    const optionalButtons = document.querySelectorAll('.option-button'); // All buttons for optional components (returns a NodeList)
    const focusSelects = document.querySelectorAll('.focus-select'); // All dropdowns for focus areas (returns a NodeList)
    const selectedFocusCategoryInput = document.getElementById('selected-focus-category'); // Hidden input for the main focus category
    const selectedSubFocusInput = document.getElementById('selected-sub-focus'); // Hidden input for the specific sub-focus
    const loadingState = document.getElementById('loading-state'); // The div containing the loading animation and text
    const resultsArea = document.getElementById('results-area'); // The div where the generated plan is displayed
    const planContent = document.getElementById('plan-content'); // The specific div for the workout plan text
    const supplementRecommendations = document.getElementById('supplement-recommendations'); // The specific div for supplement text
    const generateBtn = document.getElementById('generate-btn'); // The main "Generate Plan" button
    const printBtn = document.getElementById('print-btn'); // The "Print Plan" button in the results area
    const regenerateBtn = document.getElementById('regenerate-btn'); // The "Generate New Plan" button in the results area

    // --- Event Listeners ---
    // Attach functions to run when specific events happen on HTML elements.

    // --- Optional Components Button Logic ---
    // Add a click event listener to each optional component button.
    optionalButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Toggle the 'selected' class on the button for visual feedback (styling is in CSS).
            button.classList.toggle('selected');
            // Get the name of the option from the button's 'data-option' attribute (e.g., 'nutrition').
            const optionName = button.getAttribute('data-option');
            // Find the corresponding hidden input element (e.g., id="include_nutrition").
            const hiddenInput = document.getElementById(`include_${optionName}`);
            // Update the hidden input's value to 'true' or 'false' based on whether the button has the 'selected' class.
            // This value will be sent to the backend when the form is submitted.
            hiddenInput.value = button.classList.contains('selected') ? 'true' : 'false';
            // console.log(`Optional Component ${optionName}: ${hiddenInput.value}`); // Uncomment for debugging
        });
    });

    // --- Focus Area Single Selection Logic ---
    // Add a change event listener to each focus area dropdown.
    focusSelects.forEach(select => {
        select.addEventListener('change', (event) => {
            // 'event.target' is the specific dropdown that triggered the change.
            const currentSelect = event.target;
            // Get the selected sub-focus value (e.g., 'Chest') or an empty string if "-- Select --" is chosen.
            const selectedValue = currentSelect.value;
            // Get the main focus category (e.g., 'Upper Body') from the 'data-focus-category' attribute.
            const focusCategory = currentSelect.getAttribute('data-focus-category');

            // If a specific sub-focus (not the default empty option) was selected:
            if (selectedValue) {
                // Store the selected category and sub-focus in the hidden input fields.
                selectedFocusCategoryInput.value = focusCategory;
                selectedSubFocusInput.value = selectedValue;

                // Disable all *other* focus area dropdowns to enforce single selection.
                focusSelects.forEach(otherSelect => {
                    if (otherSelect !== currentSelect) {
                        otherSelect.value = ''; // Reset their value to the default "-- Select --".
                        otherSelect.disabled = true; // Disable the dropdown.
                    }
                });
                // console.log(`Focus Area Selected: ${focusCategory} - ${selectedValue}`); // Uncomment for debugging
            } else {
                // If the user selected the default empty option ("-- Select --") in this dropdown:
                // Clear the hidden input fields.
                selectedFocusCategoryInput.value = '';
                selectedSubFocusInput.value = '';
                // Re-enable all focus area dropdowns.
                focusSelects.forEach(otherSelect => {
                    otherSelect.disabled = false;
                });
                // console.log("Focus Area deselected"); // Uncomment for debugging
            }
        });
    });

    // --- Form Submission Logic ---
    // Add a submit event listener to the main form.
    form.addEventListener('submit', async (event) => {
        // Prevent the default browser behavior of reloading the page on form submission.
        event.preventDefault();
        // Show the loading indicator and hide the form/results.
        showLoading();

        // 1. Gather Form Data into a usable object
        const formData = new FormData(form); // Creates an object containing form data.
        const userInput = {}; // Initialize an empty object to store processed input.
        // Iterate over the form data entries.
        formData.forEach((value, key) => {
            // Map the form field names (key) to the structure expected by the backend/API prompt.
            if (key === 'selected_focus_category') {
                userInput.focusArea = value; // Rename for clarity in the backend.
            } else if (key === 'selected_sub_focus') {
                userInput.subFocus = value; // Rename for clarity.
            } else {
                 // For other fields, use the name directly.
                 // Convert the string 'true'/'false' from hidden inputs to actual boolean values.
                 if (value === 'true') userInput[key] = true;
                 else if (value === 'false') userInput[key] = false;
                 else userInput[key] = value; // Keep other values as strings.
            }
        });

        // Ensure optional component flags are explicitly boolean (belt-and-braces).
        userInput.include_nutrition = userInput.include_nutrition === true;
        userInput.include_warmup = userInput.include_warmup === true;
        userInput.include_cooldown = userInput.include_cooldown === true;
        userInput.include_progression = userInput.include_progression === true;

        // console.log("User Input for API:", userInput); // Uncomment for debugging the data being sent.

        // --- API Call and Result Handling (Try...Catch for errors) ---
        try {
            // 2. Call the Backend API
            // Use the 'await' keyword because callApi is an async function (returns a Promise).
            const apiResponse = await callApi(userInput); // Call our backend endpoint.

            // 3. Process and Display Results
            // Check if the response from the backend is valid and contains the 'plan' property.
            if (apiResponse && apiResponse.plan) {
                // Pass the generated plan text (apiResponse.plan) to the display function.
                displayResults(apiResponse.plan);
            } else {
                 // Handle cases where the backend response might be missing the plan property or is malformed.
                 console.error("Invalid response structure from backend:", apiResponse);
                 displayError("Received an unexpected response from the server.");
            }

        } catch (error) {
            // If any error occurs during the API call or processing:
            console.error("Error generating fitness plan:", error);
            // Display a user-friendly error message using the displayError function.
            // The error message might come from the callApi function or be a generic one.
            displayError(error.message || "Failed to generate fitness plan. Please check your connection or try again later.");
        } finally {
            // This 'finally' block always runs, regardless of whether an error occurred or not.
            // Hide the loading indicator once the process is complete (either success or failure).
            hideLoading();
        }
    });

    // --- Print Button Logic ---
    // Add a click event listener to the "Print Plan" button.
    printBtn.addEventListener('click', () => {
        // Use the browser's built-in print functionality.
        // This will typically open the print dialog for the current page content.
        // CSS media queries (@media print) can be used to optimize the layout for printing.
        window.print();
    });

    // --- Regenerate Button Logic ---
    // Add a click event listener to the "Generate New Plan" button.
    regenerateBtn.addEventListener('click', () => {
        // Hide the results area.
        resultsArea.style.display = 'none';
        // Clear the content of the plan and supplement divs.
        planContent.innerHTML = '';
        supplementRecommendations.innerHTML = '';
        // Show the form again.
        form.style.display = 'block';
        // Scroll the user back to the top of the form smoothly.
        form.scrollIntoView({ behavior: 'smooth' });

        // --- Optional: Reset Form Fields ---
        // Uncomment the following lines if you want the form to be completely reset
        // when the user clicks "Generate New Plan".
        /*
        form.reset(); // Resets all form inputs to their default values.
        // Manually remove 'selected' class from optional buttons.
        optionalButtons.forEach(b => b.classList.remove('selected'));
        // Manually reset and re-enable focus area dropdowns.
        focusSelects.forEach(s => { s.value = ''; s.disabled = false; });
        // Clear hidden focus inputs.
        selectedFocusCategoryInput.value = '';
        selectedSubFocusInput.value = '';
        // Reset hidden optional component inputs.
        document.getElementById('include_nutrition').value = 'false';
        document.getElementById('include_warmup').value = 'false';
        document.getElementById('include_cooldown').value = 'false';
        document.getElementById('include_progression').value = 'false';
        */
        // --- End Optional Reset ---
    });


    // --- Helper Functions ---

    // Function to show the loading indicator and hide the form/results.
    function showLoading() {
        form.style.display = 'none'; // Hide the form.
        resultsArea.style.display = 'none'; // Hide any previous results.
        loadingState.style.display = 'flex'; // Show the loading container (using flex for centering).
        // Scroll the loading indicator into view, centered vertically.
        loadingState.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Function to hide the loading indicator.
    function hideLoading() {
        loadingState.style.display = 'none'; // Hide the loading container.
    }

    // Function to display the generated plan and supplements in the results area.
    function displayResults(planText) { // Takes the raw plan text from the API response.
        // Clear any previous content from the results divs.
        planContent.innerHTML = '';
        supplementRecommendations.innerHTML = '';

        // --- Basic Formatting/Parsing ---
        // Call the function to attempt basic formatting of the raw plan text into HTML.
        // NOTE: This basic formatter is limited. For complex Markdown, a dedicated library
        // like 'marked.js' or 'showdown.js' would be much more robust.
        const formattedContent = formatApiResponse(planText);

        // Inject the formatted HTML into the respective divs.
        planContent.innerHTML = formattedContent.plan; // Display formatted plan.
        supplementRecommendations.innerHTML = formattedContent.supplements; // Display formatted supplements.
        // --- End Basic Formatting ---

        // Make the results area visible.
        resultsArea.style.display = 'block';
        // Scroll the results area into view smoothly.
        resultsArea.scrollIntoView({ behavior: 'smooth' });
        // Keep the form hidden while results are shown.
        form.style.display = 'none';
    }

     // --- Basic Markdown-to-HTML Formatter ---
     // Attempts to convert specific Markdown-like patterns from the AI response into basic HTML.
     // This needs significant improvement for production use or replacement with a library.
    function formatApiResponse(responseText) {
        let planHtml = ''; // HTML string for the workout plan section.
        let supplementHtml = ''; // HTML string for the supplement section.
        let currentSection = 'plan'; // Track which section we are currently parsing.

        // Split the response text into individual lines.
        const lines = responseText.split('\n');
        let listOpen = false; // Track if we are inside a <ul> list.

        lines.forEach(line => {
            line = line.trim(); // Remove leading/trailing whitespace.

            // --- Section Detection ---
            // Check if the line marks the start of the supplement section.
            if (line.startsWith('## RECOMMENDED SUPPLEMENTS')) {
                if (listOpen) { // Close any open list before switching sections
                    planHtml += '</ul>';
                    listOpen = false;
                }
                currentSection = 'supplements';
                // Add the main heading for the supplement section.
                supplementHtml += `<h2 class="section-heading">RECOMMENDED SUPPLEMENTS</h2>`;
                return; // Move to the next line.
            }

            // --- HTML Generation based on Section ---
            let targetHtml = (currentSection === 'plan') ? planHtml : supplementHtml;
            let isPlanSection = (currentSection === 'plan');

            // --- Markdown Pattern Matching ---
            if (line.startsWith('### ')) { // H3 headings (Exercise Names, Supplement Names)
                if (listOpen) { targetHtml += '</ul>'; listOpen = false; } // Close list before heading
                // Use different classes for styling exercise vs supplement names if needed.
                const headingClass = isPlanSection ? 'subsection-heading exercise-name' : 'subsection-heading supplement-name';
                targetHtml += `<h3 class="${headingClass}">${line.substring(4).trim()}</h3>`;
            } else if (line.startsWith('## ')) { // H2 headings (e.g., NUTRITION GUIDELINES)
                 if (listOpen) { targetHtml += '</ul>'; listOpen = false; }
                 targetHtml += `<h2 class="section-heading">${line.substring(3).trim()}</h2>`;
            } else if (line.startsWith('# ')) { // H1 headings (e.g., DAY 1) - Assuming AI uses # for main day headings
                 if (listOpen) { targetHtml += '</ul>'; listOpen = false; }
                 // Apply specific styling for Day headings (using h3 tag but maybe a specific class)
                 targetHtml += `<h3 class="day-heading">${line.substring(2).trim()}</h3>`;
            } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) { // Bold text
                 if (listOpen) { targetHtml += '</ul>'; listOpen = false; }
                 targetHtml += `<p><strong>${line.substring(2, line.length - 2).trim()}</strong></p>`;
            } else if (line.startsWith('• ')) { // Bullet points
                if (!listOpen) { // Start a new list if not already in one
                    targetHtml += '<ul>';
                    listOpen = true;
                }
                targetHtml += `<li>${line.substring(2).trim()}</li>`; // Add list item
            } else if (line.trim() === '') { // Empty lines
                 if (listOpen) { targetHtml += '</ul>'; listOpen = false; } // Close list on empty line
                 targetHtml += '<br>'; // Treat as a line break
            } else if (line.length > 0) { // Any other non-empty line
                 if (listOpen) { targetHtml += '</ul>'; listOpen = false; } // Close list if starting paragraph
                 targetHtml += `<p>${line}</p>`; // Treat as a paragraph
            }

            // Update the correct HTML string
            if (currentSection === 'plan') {
                planHtml = targetHtml;
            } else {
                supplementHtml = targetHtml;
            }
        });

        // Close any list that might still be open at the end of the text.
        if (listOpen) {
             if (currentSection === 'plan') planHtml += '</ul>';
             else supplementHtml += '</ul>';
        }

        // Return the generated HTML for both sections.
        return { plan: planHtml, supplements: supplementHtml };
    }


    // Function to display an error message in the results area.
    function displayError(message) {
        // Display the error message within the plan content area.
        // Basic styling is applied inline, but could be done via CSS classes.
        planContent.innerHTML = `<p style="color: red; text-align: center; font-weight: bold;">${message}</p>`;
        // Clear any previous supplement recommendations.
        supplementRecommendations.innerHTML = '';
        // Show the results area so the error message is visible.
        resultsArea.style.display = 'block';
        // Show the form again so the user can retry if desired.
        form.style.display = 'block';
    }

    // --- API Call Function ---
    // Makes the actual request to our backend server endpoint.
    async function callApi(userInput) {
        console.log("Calling backend API (/api/generate-plan) with input:", userInput);
        // The URL path to our backend endpoint. Since frontend and backend are served
        // from the same origin (localhost:3000), we can use a relative path.
        const apiUrl = '/api/generate-plan';

        try {
            // Use the 'fetch' API to make a POST request to the backend.
            const response = await fetch(apiUrl, {
                method: 'POST', // Specify the HTTP method.
                headers: {
                    // Tell the server we are sending JSON data.
                    'Content-Type': 'application/json',
                },
                // Convert the JavaScript userInput object into a JSON string for the request body.
                body: JSON.stringify(userInput)
            });

            // Check if the HTTP response status code indicates success (e.g., 200 OK).
            if (!response.ok) {
                // If the response status is not OK (e.g., 4xx or 5xx error):
                let errorMsg = `API Error: ${response.status} ${response.statusText}`;
                try {
                    // Try to parse the error response body as JSON (our server sends errors in JSON format).
                    const errorData = await response.json();
                    // Use the specific error message from the backend if available.
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    // Ignore if the error response body isn't valid JSON.
                }
                // Throw an error with the detailed message. This will be caught by the catch block below.
                throw new Error(errorMsg);
            }

            // If the response is OK, parse the JSON body of the response.
            // We expect the backend to return an object like { plan: "..." }.
            const data = await response.json();
            console.log("Received response from backend API.");
            return data; // Return the parsed data (the object containing the plan).

        } catch (error) {
            // Catch any errors during the fetch operation (network errors, parsing errors, errors thrown above).
            console.error("Error calling backend API:", error);
            // Re-throw the error so it can be caught by the form submission handler's catch block,
            // which will then call displayError.
            throw error;
        }
    }

}); // End of DOMContentLoaded event listener