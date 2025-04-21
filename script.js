// Global variables to track state
let selectedProduct = "Cookbook";
let selectedView = "yearly";
let selectedYear = "All";
let selectedPlatform = "All";
let productData = {}; // Will be populated from Google Sheets
let COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
let MONTHS = ["Jan", "Feb", "March", "April", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

// Chart objects
let yearlyBarChart = null;
let yearlyLineChart = null;
let monthlyBarChart = null;
let monthlyLineChart = null;
let platformBarChart = null;
let platformTotalChart = null;
let pieChart = null;

// Google Sheets configuration
const SHEET_ID = '15ONRAntBpsOfOot31skCBnaqh0GoZrr0DSHtcpujc0s'; // Replace with your actual Sheet ID
const CONFIG_SHEET_RANGE = 'Product_Config!A1:D100';
const SALES_SHEET_RANGE = 'Sales_Data!A1:F10000';
const NOTES_SHEET_RANGE = 'Notes!A1:F1000';
const API_KEY = 'YOUR_API_KEY'; // Only needed if using a restricted API key

// Initialize the dashboard when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("loading-indicator").classList.remove("hidden");
    fetchDataFromGoogleSheets()
        .then(() => {
            initializeDashboard();
            document.getElementById("loading-indicator").classList.add("hidden");
            
            // Set up auto-refresh (every 5 minutes)
            setInterval(refreshData, 5 * 60 * 1000);
        })
        .catch(error => {
            console.error("Error loading data:", error);
            document.getElementById("loading-indicator").classList.add("hidden");
            document.getElementById("error-message").textContent = "Error loading data. Please check your connection and try again.";
            document.getElementById("error-message").classList.remove("hidden");
        });
});

// Fetch data from Google Sheets
async function fetchDataFromGoogleSheets() {
    try {
        // Fetch product configuration
        const configResponse = await fetchSheetData(CONFIG_SHEET_RANGE);
        const configData = configResponse.values;
        
        // Fetch sales data
        const salesResponse = await fetchSheetData(SALES_SHEET_RANGE);
        const salesData = salesResponse.values;
        
        // Fetch notes
        const notesResponse = await fetchSheetData(NOTES_SHEET_RANGE);
        const notesData = notesResponse.values;
        
        // Process the data into our required format
        processGoogleSheetsData(configData, salesData, notesData);
        
        return true;
    } catch (error) {
        console.error("Error fetching data from Google Sheets:", error);
        throw error;
    }
}

// Helper function to fetch data from a specific sheet range
async function fetchSheetData(range) {
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
    
    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
}

// Process data from Google Sheets into our required format
function processGoogleSheetsData(configData, salesData, notesData) {
    // Initialize empty product data structure
    productData = {};
    
    // Get headers from the first row
    const configHeaders = configData[0];
    const salesHeaders = salesData[0];
    const notesHeaders = notesData[0];
    
    // Process product configuration
    for (let i = 1; i < configData.length; i++) {
        const row = configData[i];
        const productName = row[configHeaders.indexOf("Product")];
        
        // Skip if no product name
        if (!productName) continue;
        
        // Create product entry if it doesn't exist
        if (!productData[productName]) {
            productData[productName] = {
                platforms: {},
                notes: [],
                config: {
                    years: [],
                    platforms: [],
                    hasEbooks: row[configHeaders.indexOf("HasEbooks")] === "TRUE",
                    growthFactor: parseFloat(row[configHeaders.indexOf("GrowthFactor")]),
                    productLabel: row[configHeaders.indexOf("ProductLabel")]
                }
            };
        }
    }
    
    // Process sales data
    for (let i = 1; i < salesData.length; i++) {
        const row = salesData[i];
        
        // Skip if row doesn't have enough data
        if (row.length < salesHeaders.length) continue;
        
        const productName = row[salesHeaders.indexOf("Product")];
        const platformName = row[salesHeaders.indexOf("Platform")];
        const type = row[salesHeaders.indexOf("Type")];
        const year = row[salesHeaders.indexOf("Year")];
        const month = row[salesHeaders.indexOf("Month")];
        const sales = parseInt(row[salesHeaders.indexOf("Sales")]);
        
        // Skip if missing critical data
        if (!productName || !platformName || !type || !year || !month || isNaN(sales)) continue;
        
        // Ensure product exists
        if (!productData[productName]) {
            console.warn(`Product ${productName} not found in config`);
            continue;
        }
        
        // Create platform if it doesn't exist
        if (!productData[productName].platforms[platformName]) {
            productData[productName].platforms[platformName] = {};
        }
        
        // Create type if it doesn't exist
        if (!productData[productName].platforms[platformName][type]) {
            productData[productName].platforms[platformName][type] = {};
        }
        
        // Create year if it doesn't exist
        if (!productData[productName].platforms[platformName][type][year]) {
            productData[productName].platforms[platformName][type][year] = {};
            
            // Add year to years array if not already present
            if (!productData[productName].config.years.includes(year)) {
                productData[productName].config.years.push(year);
            }
        }
        
        // Add sales data
        productData[productName].platforms[platformName][type][year][month] = sales;
        
        // Add platform to platforms array if not already present
        if (!productData[productName].config.platforms.includes(platformName)) {
            productData[productName].config.platforms.push(platformName);
        }
    }
    
    // Sort years and add "All" option
    for (const product in productData) {
        productData[product].config.years.sort();
        productData[product].config.years.push("All");
        
        // Add "All" to platforms
        productData[product].config.platforms.push("All");
    }
    
    // Process notes
    for (let i = 1; i < notesData.length; i++) {
        const row = notesData[i];
        
        // Skip if row doesn't have enough data
        if (row.length < notesHeaders.length) continue;
        
        const productName = row[notesHeaders.indexOf("Product")];
        const id = parseInt(row[notesHeaders.indexOf("ID")]);
        const text = row[notesHeaders.indexOf("Note")];
        const yearCondition = row[notesHeaders.indexOf("YearCondition")].split(",");
        const platformCondition = row[notesHeaders.indexOf("PlatformCondition")].split(",");
        const monthCondition = row[notesHeaders.indexOf("MonthCondition")].split(",");
        
        // Skip if missing critical data
        if (!productName || isNaN(id) || !text) continue;
        
        // Ensure product exists
        if (!productData[productName]) {
            console.warn(`Product ${productName} not found in config`);
            continue;
        }
        
        // Create the note with a function that evaluates the conditions
        const note = {
            id,
            text,
            showWhen: (year, platform, month) => {
                const yearMatch = yearCondition.length === 0 || yearCondition[0] === "" || yearCondition.includes(year);
                const platformMatch = platformCondition.length === 0 || platformCondition[0] === "" || platformCondition.includes(platform);
                const monthMatch = monthCondition.length === 0 || monthCondition[0] === "" || !month || monthCondition.includes(month);
                
                return yearMatch && platformMatch && monthMatch;
            }
        };
        
        // Add note to product
        productData[productName].notes.push(note);
    }
    
    // Add product insights
    addProductInsights();
}

// Add product insights (these could also be moved to the Google Sheet)
function addProductInsights() {
    const productInsights = {
        "Cookbook": [
            "Only product with significant KDP sales",
            "Highest overall sales volume across all platforms"
        ],
        "Liner": [
            "No ClickFunnels sales channel",
            "Significant stock availability issues in 2024"
        ],
        "Magnet": [
            "Strong digital sales component",
            "February 2025 showed unusual sales pattern"
        ],
        "Thermometer": [
            "Newest product in the lineup (2024 launch)",
            "Amazon US is dominant sales channel"
        ]
    };
    
    // Add insights to products
    for (const product in productInsights) {
        if (productData[product]) {
            productData[product].insights = productInsights[product];
        }
    }
}

// Refresh data from Google Sheets
async function refreshData() {
    try {
        // Save current selections
        const currentSelections = {
            product: selectedProduct,
            view: selectedView,
            year: selectedYear,
            platform: selectedPlatform
        };
        
        // Fetch new data
        await fetchDataFromGoogleSheets();
        
        // Restore selections if they're still valid
        if (productData[currentSelections.product]) {
            selectedProduct = currentSelections.product;
            selectedView = currentSelections.view;
            
            // Check if year is still valid
            if (productData[selectedProduct].config.years.includes(currentSelections.year)) {
                selectedYear = currentSelections.year;
            } else {
                selectedYear = "All";
            }
            
            // Check if platform is still valid
            if (productData[selectedProduct].config.platforms.includes(currentSelections.platform)) {
                selectedPlatform = currentSelections.platform;
            } else {
                selectedPlatform = "All";
            }
        }
        
        // Update the dashboard
        updateDashboard();
        
        // Show refresh indicator
        const refreshIndicator = document.getElementById("refresh-indicator");
        refreshIndicator.classList.remove("hidden");
        setTimeout(() => {
            refreshIndicator.classList.add("hidden");
        }, 2000);
    } catch (error) {
        console.error("Error refreshing data:", error);
        document.getElementById("error-message").textContent = "Error refreshing data. Using last loaded data.";
        document.getElementById("error-message").classList.remove("hidden");
        
        setTimeout(() => {
            document.getElementById("error-message").classList.add("hidden");
        }, 5000);
    }
}

// Manual refresh button handler
function handleManualRefresh() {
    document.getElementById("loading-indicator").classList.remove("hidden");
    refreshData()
        .then(() => {
            document.getElementById("loading-indicator").classList.add("hidden");
        })
        .catch(error => {
            console.error("Error during manual refresh:", error);
            document.getElementById("loading-indicator").classList.add("hidden");
        });
}

// Main initialization function
function initializeDashboard() {
    // Populate product select dropdown
    populateProductSelect();
    
    // Set up event listeners
    document.getElementById("product-select").addEventListener("change", handleProductChange);
    document.getElementById("view-select").addEventListener("change", handleViewChange);
    document.getElementById("year-select").addEventListener("change", handleYearChange);
    document.getElementById("platform-select").addEventListener("change", handlePlatformChange);
    document.getElementById("refresh-button").addEventListener("click", handleManualRefresh);
    
    // Initialize the dashboard with default values
    updateDashboard();
}

// The rest of the code (event handlers, chart updates, data processing functions)
// remains exactly the same as in the original script.js file, so I'm not repeating it here.

// Populate product select dropdown
function populateProductSelect() {
    const productSelect = document.getElementById("product-select");
    
    // Clear existing options
    productSelect.innerHTML = "";
    
    Object.keys(productData).forEach(product => {
        const option = document.createElement("option");
        option.value = product;
        option.textContent = product;
        productSelect.appendChild(option);
    });
    
    // Set selected product
    productSelect.value = selectedProduct;
}

// Handle product change
function handleProductChange(e) {
    selectedProduct = e.target.value;
    
    // Reset to default values
    selectedView = "yearly";
    selectedYear = "All";
    selectedPlatform = "All";
    
    // Update select elements to reflect default values
    document.getElementById("view-select").value = selectedView;
    
    // Update the dashboard
    updateDashboard();
}

// Handle view change
function handleViewChange(e) {
    selectedView = e.target.value;
    
    // Enable/disable year select based on view
    document.getElementById("year-select").disabled = (selectedView === "yearly");
    document.getElementById("platform-select").disabled = (selectedView === "platform");
    
    // Update the dashboard
    updateDashboard();
}

// Handle year change
function handleYearChange(e) {
    selectedYear = e.target.value;
    updateDashboard();
}

// Handle platform change
function handlePlatformChange(e) {
    selectedPlatform = e.target.value;
    updateDashboard();
}

// Main function to update the dashboard
function updateDashboard() {
    // Skip if no product data
    if (!productData[selectedProduct]) {
        console.error(`No data found for product: ${selectedProduct}`);
        return;
    }
    
    const currentProductData = productData[selectedProduct];
    const { config } = currentProductData;
    const { years, platforms, hasEbooks, growthFactor, productLabel } = config;
    
    // Update select options
    updateYearSelect(years);
    updatePlatformSelect(platforms);
    
    // Update the UI based on hasEbooks
    updateEbookDisplay(hasEbooks, productLabel);
    
    // Show/hide views based on selection
    updateViewVisibility();
    
    // Update data
    const yearlyData = calculateYearlyTotals(currentProductData, selectedPlatform, hasEbooks);
    const platformData = calculatePlatformTotals(currentProductData, selectedYear, hasEbooks);
    const monthlyData = getMonthlyData(currentProductData, selectedYear, selectedPlatform, hasEbooks);
    const forecast2025 = calculate2025Forecast(currentProductData, selectedPlatform, hasEbooks, growthFactor);
    const pieChartData = preparePieChartData(currentProductData, selectedYear, hasEbooks);
    
    // Create summary data including forecast
    const summaryData = [...yearlyData];
    if ((selectedYear === 'All' || selectedYear === '2025') && forecast2025) {
        summaryData.push(forecast2025);
    }
    
    // Update charts
    updateYearlyCharts(yearlyData, hasEbooks, productLabel);
    updateMonthlyCharts(monthlyData, hasEbooks, productLabel);
    updatePlatformCharts(platformData, hasEbooks, productLabel);
    updatePieChart(pieChartData);
    
    // Update table
    updateSummaryTable(summaryData, hasEbooks, productLabel);
    
    // Update alert
    updateAlert(currentProductData);
    
    // Update notes
    updateNotes(currentProductData);
    
    // Update forecast explanation
    updateForecastExplanation(forecast2025, growthFactor);
    
    // Update product comparison section
    updateProductComparison(yearlyData, platformData, hasEbooks, productLabel);
}

// Update year select options
function updateYearSelect(years) {
    const yearSelect = document.getElementById("year-select");
    
    // Clear existing options
    yearSelect.innerHTML = "";
    
    // Add new options
    years.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    });
    
    // Set selected value
    if (years.includes(selectedYear)) {
        yearSelect.value = selectedYear;
    } else {
        selectedYear = years[0];
        yearSelect.value = selectedYear;
    }
}

// Update platform select options
function updatePlatformSelect(platforms) {
    const platformSelect = document.getElementById("platform-select");
    
    // Clear existing options
    platformSelect.innerHTML = "";
    
    // Add new options
    platforms.forEach(platform => {
        const option = document.createElement("option");
        option.value = platform;
        option.textContent = platform;
        platformSelect.appendChild(option);
    });
    
    // Set selected value
    if (platforms.includes(selectedPlatform)) {
        platformSelect.value = selectedPlatform;
    } else {
        selectedPlatform = platforms[0];
        platformSelect.value = selectedPlatform;
    }
}

// Update eBook display
function updateEbookDisplay(hasEbooks, productLabel) {
    const ebookColumn = document.querySelectorAll(".ebook-column");
    const ebookHeader = document.getElementById("ebook-header");
    const physicalHeader = document.getElementById("physical-header");
    
    // Show/hide eBook column
    ebookColumn.forEach(col => {
        col.style.display = hasEbooks ? "table-cell" : "none";
    });
    
    // Update header text
    physicalHeader.textContent = `Physical ${productLabel}`;
    ebookHeader.textContent = productLabel === "Magnet" ? "Digital Products" : "eBooks";
}

// The rest of the functions from the original script.js would be included here
// (updateViewVisibility, updateChartTitles, updateYearlyCharts, updateMonthlyCharts,
// updatePlatformCharts, updatePieChart, updateSummaryTable, updateAlert, updateNotes,
// updateForecastExplanation, updateProductComparison, calculateYearlyTotals,
// calculatePlatformTotals, getMonthlyData, calculate2025Forecast, preparePieChartData)
// They remain exactly the same as in the original, so I'm not repeating them here.