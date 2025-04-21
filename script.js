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
const SHEET_ID = '15ONRAntBpsOfOot31skCBnaqh0GoZrr0DSHtcpujc0s'; // Your Sheet ID
// These are the public URLs for your published sheets
const CONFIG_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Product_Config`;
const SALES_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sales_Data`;
const NOTES_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Notes`;

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
        // Fetch all sheet data in parallel
        const [configData, salesData, notesData] = await Promise.all([
            fetchCSVData(CONFIG_SHEET_URL),
            fetchCSVData(SALES_SHEET_URL),
            fetchCSVData(NOTES_SHEET_URL)
        ]);
        
        // Process the data into our required format
        processGoogleSheetsData(configData, salesData, notesData);
        
        // Update last updated time
        document.getElementById("last-updated").textContent = new Date().toLocaleString();
        
        return true;
    } catch (error) {
        console.error("Error fetching data from Google Sheets:", error);
        throw error;
    }
}

// Helper function to fetch and parse CSV data
async function fetchCSVData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        
        // Parse CSV to array of arrays using simple CSV parsing
        return parseCSV(csvText);
    } catch (error) {
        console.error("Error fetching CSV data:", error);
        throw error;
    }
}

// Simple CSV parser
function parseCSV(text) {
    const lines = text.split('\n');
    
    return lines.map(line => {
        // Handle quoted values with commas inside them
        let inQuote = false;
        let currentValue = '';
        let result = [];
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                result.push(currentValue);
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        
        // Don't forget to add the last value
        result.push(currentValue);
        
        // Clean up any quotes in the values
        return result.map(value => value.replace(/^"(.*)"$/, '$1'));
    }).filter(row => row.length > 1 || (row.length === 1 && row[0] !== '')); // Filter out empty rows
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
    
    // If switching to monthly view and year is set to "All", automatically select the most recent year
    if (selectedView === "monthly" && selectedYear === "All") {
        // Get available years (excluding "All")
        const availableYears = productData[selectedProduct].config.years.filter(y => y !== "All");
        
        if (availableYears.length > 0) {
            // Sort years numerically in descending order and select the most recent
            const sortedYears = [...availableYears].sort((a, b) => parseInt(b) - parseInt(a));
            selectedYear = sortedYears[0];
            
            // Update the year select element
            document.getElementById("year-select").value = selectedYear;
        }
    }
    
    // Enable/disable select elements based on view
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

// Update view visibility
function updateViewVisibility() {
    // Hide all views
    document.getElementById("yearly-view").classList.add("hidden");
    document.getElementById("monthly-view").classList.add("hidden");
    document.getElementById("platform-view").classList.add("hidden");
    
    // Show selected view
    if (selectedView === "yearly") {
        document.getElementById("yearly-view").classList.remove("hidden");
    } else if (selectedView === "monthly") {
        document.getElementById("monthly-view").classList.remove("hidden");
        
        // Only show the "please select a year" message if year is still "All"
        const monthlyMessage = document.getElementById("monthly-message");
        monthlyMessage.classList.toggle("hidden", selectedYear !== "All");
        
        // Show the empty data message if we have no data
        const monthlyData = getMonthlyData(
            productData[selectedProduct], 
            selectedYear, 
            selectedPlatform, 
            productData[selectedProduct].config.hasEbooks
        );
        const hasData = monthlyData.months.length > 0;
        document.getElementById("monthly-empty-message").classList.toggle("hidden", hasData);
    } else if (selectedView === "platform") {
        document.getElementById("platform-view").classList.remove("hidden");
    }
}

// Calculate yearly totals
function calculateYearlyTotals(productData, platform, hasEbooks) {
    const result = [];
    const years = productData.config.years.filter(y => y !== "All");
    
    years.forEach(year => {
        const yearData = { year };
        let physicalTotal = 0;
        let ebookTotal = 0;
        
        // Loop through all platforms or just the selected one
        const platformsToCheck = platform === "All" 
            ? productData.config.platforms.filter(p => p !== "All") 
            : [platform];
        
        platformsToCheck.forEach(platformName => {
            if (productData.platforms[platformName]) {
                // Add physical sales
                if (productData.platforms[platformName]["Physical"]
                    && productData.platforms[platformName]["Physical"][year]) {
                    const monthlySales = productData.platforms[platformName]["Physical"][year];
                    physicalTotal += Object.values(monthlySales).reduce((sum, val) => sum + val, 0);
                }
                
                // Add ebook/digital sales
                if (hasEbooks) {
                    const ebookType = productData.config.productLabel === "Magnet" ? "Digital" : "eBook";
                    if (productData.platforms[platformName][ebookType]
                        && productData.platforms[platformName][ebookType][year]) {
                        const monthlySales = productData.platforms[platformName][ebookType][year];
                        ebookTotal += Object.values(monthlySales).reduce((sum, val) => sum + val, 0);
                    }
                }
            }
        });
        
        yearData.physical = physicalTotal;
        yearData.ebook = ebookTotal;
        yearData.total = physicalTotal + ebookTotal;
        
        result.push(yearData);
    });
    
    return result;
}

// Calculate platform totals
function calculatePlatformTotals(productData, year, hasEbooks) {
    const result = [];
    const platforms = productData.config.platforms.filter(p => p !== "All");
    
    platforms.forEach(platformName => {
        if (productData.platforms[platformName]) {
            const platformData = { platform: platformName };
            let physicalTotal = 0;
            let ebookTotal = 0;
            
            // Handle "All" years or specific year
            const yearsToCheck = year === "All" 
                ? productData.config.years.filter(y => y !== "All") 
                : [year];
            
            yearsToCheck.forEach(yearVal => {
                // Add physical sales
                if (productData.platforms[platformName]["Physical"]
                    && productData.platforms[platformName]["Physical"][yearVal]) {
                    const monthlySales = productData.platforms[platformName]["Physical"][yearVal];
                    physicalTotal += Object.values(monthlySales).reduce((sum, val) => sum + val, 0);
                }
                
                // Add ebook/digital sales
                if (hasEbooks) {
                    const ebookType = productData.config.productLabel === "Magnet" ? "Digital" : "eBook";
                    if (productData.platforms[platformName][ebookType]
                        && productData.platforms[platformName][ebookType][yearVal]) {
                        const monthlySales = productData.platforms[platformName][ebookType][yearVal];
                        ebookTotal += Object.values(monthlySales).reduce((sum, val) => sum + val, 0);
                    }
                }
            });
            
            platformData.physical = physicalTotal;
            platformData.ebook = ebookTotal;
            platformData.total = physicalTotal + ebookTotal;
            
            result.push(platformData);
        }
    });
    
    return result;
}

// Get monthly data
function getMonthlyData(productData, year, platform, hasEbooks) {
    // If year is "All", return empty data
    if (year === "All") {
        return { months: [], physical: [], ebook: [], total: [] };
    }
    
    const months = [];
    const physical = [];
    const ebook = [];
    const total = [];
    
    // Define platforms to check
    const platformsToCheck = platform === "All" 
        ? productData.config.platforms.filter(p => p !== "All") 
        : [platform];
    
    // Collect monthly data for all platforms
    for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString();
        let physicalTotal = 0;
        let ebookTotal = 0;
        
        platformsToCheck.forEach(platformName => {
            if (productData.platforms[platformName]) {
                // Add physical sales
                if (productData.platforms[platformName]["Physical"]
                    && productData.platforms[platformName]["Physical"][year]
                    && productData.platforms[platformName]["Physical"][year][monthStr] !== undefined) {
                    physicalTotal += productData.platforms[platformName]["Physical"][year][monthStr];
                }
                
                // Add ebook/digital sales
                if (hasEbooks) {
                    const ebookType = productData.config.productLabel === "Magnet" ? "Digital" : "eBook";
                    if (productData.platforms[platformName][ebookType]
                        && productData.platforms[platformName][ebookType][year]
                        && productData.platforms[platformName][ebookType][year][monthStr] !== undefined) {
                        ebookTotal += productData.platforms[platformName][ebookType][year][monthStr];
                    }
                }
            }
        });
        
        // Always add the month, even if there's no data
        // This ensures we show all months in the chart
        months.push(MONTHS[month - 1]);
        physical.push(physicalTotal);
        ebook.push(ebookTotal);
        total.push(physicalTotal + ebookTotal);
    }
    
    return { months, physical, ebook, total };
}

// Calculate 2025 forecast
function calculate2025Forecast(productData, platform, hasEbooks, growthFactor) {
    // Only forecast if we have 2024 data
    const data2024 = productData.config.years.includes("2024") 
        ? calculateYearlyTotals(productData, platform, hasEbooks)
            .find(d => d.year === "2024")
        : null;
    
    if (!data2024) return null;
    
    // Get actual 2025 data if it exists
    const actual2025 = productData.config.years.includes("2025")
        ? calculateYearlyTotals(productData, platform, hasEbooks)
            .find(d => d.year === "2025")
        : null;
        
    // Apply growth factor to 2024 data
    const forecast = {
        year: "2025 (Forecast)",
        physical: Math.round(data2024.physical * growthFactor),
        ebook: hasEbooks ? Math.round(data2024.ebook * growthFactor) : 0,
        total: 0,
        isForecast: true
    };
    
    forecast.total = forecast.physical + forecast.ebook;
    
    // If we have actual data, add comparison
    if (actual2025) {
        const completionPercentage = calculateCompletionPercentage(actual2025, forecast);
        forecast.physicalActual = actual2025.physical;
        forecast.ebookActual = actual2025.ebook;
        forecast.totalActual = actual2025.total;
        forecast.completionPercentage = completionPercentage;
    }
    
    return forecast;
}

// Calculate completion percentage for forecast
function calculateCompletionPercentage(actual, forecast) {
    return Math.round((actual.total / forecast.total) * 100);
}

// Prepare data for pie chart
function preparePieChartData(productData, year, hasEbooks) {
    const platformTotals = calculatePlatformTotals(productData, year, hasEbooks);
    const labels = [];
    const physicalData = [];
    const ebookData = [];
    
    platformTotals.forEach(platform => {
        labels.push(platform.platform);
        physicalData.push(platform.physical);
        if (hasEbooks) {
            ebookData.push(platform.ebook);
        }
    });
    
    return { labels, physicalData, ebookData };
}

// Update yearly charts
function updateYearlyCharts(yearlyData, hasEbooks, productLabel) {
    const ctx1 = document.getElementById('yearly-bar-chart').getContext('2d');
    const ctx2 = document.getElementById('yearly-line-chart').getContext('2d');
    
    // Prepare data
    const labels = yearlyData.map(d => d.year);
    const physicalData = yearlyData.map(d => d.physical);
    const ebookData = hasEbooks ? yearlyData.map(d => d.ebook) : [];
    const totalData = yearlyData.map(d => d.total);
    
    // Destroy existing charts
    if (yearlyBarChart) yearlyBarChart.destroy();
    if (yearlyLineChart) yearlyLineChart.destroy();
    
    // Create bar chart
    yearlyBarChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Physical ${productLabel}`,
                    data: physicalData,
                    backgroundColor: COLORS[0],
                    borderColor: COLORS[0],
                    borderWidth: 1
                },
                ...(hasEbooks ? [{
                    label: productLabel === "Magnet" ? "Digital Products" : "eBooks",
                    data: ebookData,
                    backgroundColor: COLORS[1],
                    borderColor: COLORS[1],
                    borderWidth: 1
                }] : [])
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
    
    // Create line chart
    yearlyLineChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Sales',
                    data: totalData,
                    backgroundColor: COLORS[5],
                    borderColor: COLORS[5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Update monthly charts
function updateMonthlyCharts(monthlyData, hasEbooks, productLabel) {
    const ctx1 = document.getElementById('monthly-bar-chart').getContext('2d');
    const ctx2 = document.getElementById('monthly-line-chart').getContext('2d');
    
    // Check if we have any data (sum of all values > 0)
    const hasAnyData = monthlyData.total.reduce((sum, val) => sum + val, 0) > 0;
    
    // Show/hide empty message
    document.getElementById("monthly-empty-message").classList.toggle("hidden", hasAnyData);
    
    // Destroy existing charts
    if (monthlyBarChart) monthlyBarChart.destroy();
    if (monthlyLineChart) monthlyLineChart.destroy();
    
    if (!hasAnyData) return;
    
    // Create bar chart
    monthlyBarChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: monthlyData.months,
            datasets: [
                {
                    label: `Physical ${productLabel}`,
                    data: monthlyData.physical,
                    backgroundColor: COLORS[0],
                    borderColor: COLORS[0],
                    borderWidth: 1
                },
                ...(hasEbooks ? [{
                    label: productLabel === "Magnet" ? "Digital Products" : "eBooks",
                    data: monthlyData.ebook,
                    backgroundColor: COLORS[1],
                    borderColor: COLORS[1],
                    borderWidth: 1
                }] : [])
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
    
    // Create line chart
    monthlyLineChart = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: monthlyData.months,
            datasets: [
                {
                    label: 'Total Sales',
                    data: monthlyData.total,
                    backgroundColor: COLORS[5],
                    borderColor: COLORS[5],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Update platform charts
function updatePlatformCharts(platformData, hasEbooks, productLabel) {
    const ctx1 = document.getElementById('platform-bar-chart').getContext('2d');
    const ctx2 = document.getElementById('platform-total-chart').getContext('2d');
    
    // Prepare data
    const labels = platformData.map(d => d.platform);
    const physicalData = platformData.map(d => d.physical);
    const ebookData = hasEbooks ? platformData.map(d => d.ebook) : [];
    const totalData = platformData.map(d => d.total);
    
    // Destroy existing charts
    if (platformBarChart) platformBarChart.destroy();
    if (platformTotalChart) platformTotalChart.destroy();
    
    // Create bar chart
    platformBarChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: `Physical ${productLabel}`,
                    data: physicalData,
                    backgroundColor: COLORS[0],
                    borderColor: COLORS[0],
                    borderWidth: 1
                },
                ...(hasEbooks ? [{
                    label: productLabel === "Magnet" ? "Digital Products" : "eBooks",
                    data: ebookData,
                    backgroundColor: COLORS[1],
                    borderColor: COLORS[1],
                    borderWidth: 1
                }] : [])
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
    
    // Create bar chart for total sales by platform
    platformTotalChart = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total Sales',
                    data: totalData,
                    backgroundColor: COLORS[5],
                    borderColor: COLORS[5],
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// Update pie chart
function updatePieChart(pieChartData) {
    const ctx = document.getElementById('pie-chart').getContext('2d');
    
    // Prepare data
    const hasEbookData = pieChartData.ebookData && pieChartData.ebookData.length > 0;
    const totalValues = hasEbookData 
        ? pieChartData.physicalData.map((physical, i) => physical + pieChartData.ebookData[i])
        : pieChartData.physicalData;
    
    // Calculate percentages and add to labels
    const totalSum = totalValues.reduce((sum, value) => sum + value, 0);
    const percentages = totalValues.map(value => ((value / totalSum) * 100).toFixed(0));
    const labelsWithPercentages = pieChartData.labels.map((label, i) => 
        `${label}: ${percentages[i]}%`
    );
    
    // Destroy existing chart
    if (pieChart) pieChart.destroy();
    
    // Create pie chart
    pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labelsWithPercentages,
            datasets: hasEbookData ? [
                {
                    label: 'Sales Distribution',
                    data: totalValues,
                    backgroundColor: COLORS,
                    borderColor: '#fff',
                    borderWidth: 1
                }
            ] : [
                {
                    label: 'Sales Distribution',
                    data: totalValues,
                    backgroundColor: COLORS,
                    borderColor: '#fff',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = ((value / totalSum) * 100).toFixed(1);
                            return `${label.split(':')[0]}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Update summary table
function updateSummaryTable(summaryData, hasEbooks, productLabel) {
    const tableBody = document.getElementById('summary-table-body');
    
    // Clear existing rows
    tableBody.innerHTML = "";
    
    // Add rows for each year
    summaryData.forEach(yearData => {
        const row = document.createElement('tr');
        
        // Add forecast class if it's a forecast
        if (yearData.isForecast) {
            row.classList.add('forecast-row');
        }
        
        // Add year column
        const yearCell = document.createElement('td');
        yearCell.textContent = yearData.year;
        row.appendChild(yearCell);
        
        // Add physical column
        const physicalCell = document.createElement('td');
        if (yearData.isForecast && yearData.physicalActual !== undefined) {
            physicalCell.textContent = `${yearData.physicalActual} / ${yearData.physical}`;
        } else {
            physicalCell.textContent = yearData.physical;
        }
        row.appendChild(physicalCell);
        
        // Add ebook column
        if (hasEbooks) {
            const ebookCell = document.createElement('td');
            if (yearData.isForecast && yearData.ebookActual !== undefined) {
                ebookCell.textContent = `${yearData.ebookActual} / ${yearData.ebook}`;
            } else {
                ebookCell.textContent = yearData.ebook;
            }
            row.appendChild(ebookCell);
        }
        
        // Add total column
        const totalCell = document.createElement('td');
        if (yearData.isForecast && yearData.totalActual !== undefined) {
            totalCell.textContent = `${yearData.totalActual} / ${yearData.total} (${yearData.completionPercentage}%)`;
        } else {
            totalCell.textContent = yearData.total;
        }
        row.appendChild(totalCell);
        
        // Add row to table
        tableBody.appendChild(row);
    });
}

// Update alert
function updateAlert(productData) {
    const alertContainer = document.getElementById("alert-container");
    
    // Check for alerts in the product data (would be defined in a real app)
    const hasAlert = false; // For demo purposes, no alerts
    
    // Show/hide alert
    alertContainer.classList.toggle("hidden", !hasAlert);
    
    // Set alert content if needed
    if (hasAlert) {
        alertContainer.textContent = "Alert message would go here";
    }
}

// Update notes
function updateNotes(productData) {
    const notesContainer = document.getElementById("notes-container");
    const notesList = document.getElementById("notes-list");
    
    // Get relevant notes
    const relevantNotes = productData.notes.filter(note => 
        note.showWhen(selectedYear, selectedPlatform, selectedView === "monthly" ? selectedMonth : null)
    );
    
    // Show/hide notes container
    notesContainer.classList.toggle("hidden", relevantNotes.length === 0);
    
    // Clear existing notes
    notesList.innerHTML = "";
    
    // Add notes
    relevantNotes.forEach(note => {
        const li = document.createElement("li");
        li.textContent = note.text;
        notesList.appendChild(li);
    });
}

// Update forecast explanation
function updateForecastExplanation(forecast, growthFactor) {
    const forecastContainer = document.getElementById("forecast-container");
    const forecastContent = document.getElementById("forecast-content");
    
    // Show/hide forecast container
    forecastContainer.classList.toggle("hidden", !forecast);
    
    if (forecast) {
        forecastContent.innerHTML = `
            <p>This forecast is based on:</p>
            <ol class="forecast-list">
                <li>Previous year sales data with a growth factor of ${growthFactor.toFixed(1)}x</li>
                <li>Historical seasonal patterns from previous years</li>
                <li>Adjustments for known marketing activities</li>
            </ol>
            
            <p>Adjustments include:</p>
            <ul class="adjustment-list">
                <li>Planned promotional activities</li>
                <li>Inventory availability predictions</li>
                <li>Market trend analysis</li>
            </ul>
            
            <p class="forecast-note">Note: This is a simplified forecast for demonstration purposes.</p>
        `;
    }
}

// Update product comparison
function updateProductComparison(yearlyData, platformData, hasEbooks, productLabel) {
    // Update product title
    document.getElementById("current-product-title").textContent = `Current Product: ${selectedProduct}`;
    
    // Get latest year data
    const latestYearData = [...yearlyData].sort((a, b) => b.year - a.year)[0];
    
    // Get top platform
    const topPlatform = [...platformData].sort((a, b) => b.total - a.total)[0];
    
    // Calculate ratio
    let ratio = "N/A";
    if (hasEbooks && latestYearData && latestYearData.physical > 0 && latestYearData.ebook > 0) {
        ratio = `${(latestYearData.physical / latestYearData.ebook).toFixed(1)}:1`;
    }
    
    // Update displays
    document.getElementById("current-product-sales").textContent = latestYearData 
        ? `Total sales in ${latestYearData.year}: ${latestYearData.total}`
        : "Total sales: N/A";
        
    document.getElementById("current-product-platform").textContent = topPlatform
        ? `Top platform: ${topPlatform.platform} (${topPlatform.total} sales)`
        : "Top platform: N/A";
        
    document.getElementById("current-product-ratio").textContent = `Physical to ${productLabel === "Magnet" ? "Digital" : "eBook"} ratio: ${ratio}`;
    
    // Update insights
    const insightsList = document.getElementById("product-insights");
    insightsList.innerHTML = "";
    
    if (productData[selectedProduct].insights) {
        productData[selectedProduct].insights.forEach(insight => {
            const li = document.createElement("li");
            li.textContent = insight;
            insightsList.appendChild(li);
        });
    } else {
        const li = document.createElement("li");
        li.textContent = "No specific insights available";
        insightsList.appendChild(li);
    }
}
