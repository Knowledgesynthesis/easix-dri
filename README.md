# Dynamic EASIX DRI: Landmark Predictor

A web-based research tool for calculating and visualizing dynamic EASIX (Endothelial Activation and Stress Index) scores and estimating individualized 2-year event rates using a landmark LME + Cox model.

## Overview

This application enables researchers and clinicians to:

- **Calculate EASIX scores** from post-transplant laboratory values (LDH, creatinine, platelets)
- **Fit regression models** to log₂(EASIX) values over time (days +20 to +120)
- **Predict the 2-year event rate** at day +120 using a validated landmark LME (log₂(EASIX) + slope) plus Cox survival model with DRI
- **Visualize trends** with interactive charts showing individual data points and regression lines
- **Inspect dynamic landmarks** such as the shrinkage-corrected slope and log₂(EASIX) at day +120

## Features

- **Client-side calculation**: All computations run locally in the browser—no data is sent to external servers
- **Multiple input methods**: Enter lab values directly or provide pre-calculated EASIX/log₂(EASIX) values
- **Clinical context**: Disease Risk Index (DRI) selection feeds the survival model (High/Very High vs. Low/Intermediate)
- **Visual feedback**: Mini-gauges show normal ranges for lab values; charts display fitted regression lines
- **Dynamic event rate**: Outputs the individualized 2-year event rate (%) using the extracted R model coefficients

## How to Use

### Run Locally

**Prerequisites:** Node.js (version 16 or higher)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

### Input Data

1. **Add lab entries**: Click "Add Lab Row" to enter transplant lab values (Day, LDH, Creatinine, Platelets) from day +20 to +120 post-transplant
2. **Optional overrides**: Manually specify a slope or directly enter log₂(EASIX) values if already calculated
3. **Disease Risk Index**: Select DRI (High/Very High vs. Low/Intermediate) — required for the landmark prediction
4. **Compute**: Click "Compute" to generate results

### Interpretation

- **2-year event rate**: Displayed when ≥2 valid time points and a DRI category are available
- **2-year survival**: Always shown alongside the event rate (`100 - event rate`)
- **Historical thresholding**: The predicted log₂(EASIX) at day +90 is still available for comparison against the published 2.32 cut-point
- **Insufficient Data**: Fewer than two valid lab rows in the +20 to +120 window

## Technical Details

- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS
- **Visualization**: Custom chart components using SVG
- **Build tool**: Vite

## Disclaimers

This tool is intended for **research and educational purposes only**. The 2-year mortality rate (event rate) is derived from the manuscript's landmark LME + Cox model and should not be interpreted as a clinical prognosis. EASIX calculations can be affected by platelet transfusions, acute kidney injury, or sparse sampling. More time points generally yield more reliable slope estimates.

## License

This project is for research use. Please refer to the original manuscript for methodological details and clinical context.
