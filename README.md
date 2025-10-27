# Dynamic EASIX DRI: Rule-Based Stratifier

A web-based research tool for calculating and visualizing dynamic EASIX (Endothelial Activation and Stress Index) scores to stratify transplant risk based on time-dependent biomarker trends.

## Overview

This application enables researchers and clinicians to:

- **Calculate EASIX scores** from post-transplant laboratory values (LDH, creatinine, platelets)
- **Fit regression models** to log₂(EASIX) values over time (days +20 to +120)
- **Predict risk classification** at day +90 based on a threshold of log₂(EASIX) ≥ 2.32
- **Visualize trends** with interactive charts showing individual data points and regression lines
- **View group-level outcomes** including 1-year non-relapse mortality (NRM) stratified by clinical factors

## Features

- **Client-side calculation**: All computations run locally in the browser—no data is sent to external servers
- **Multiple input methods**: Enter lab values directly or provide pre-calculated EASIX/log₂(EASIX) values
- **Clinical context**: Optionally include Disease Risk Index (DRI), GVHD prophylaxis, and conditioning regimen to view relevant outcome data
- **Visual feedback**: Mini-gauges show normal ranges for lab values; charts display fitted regression lines
- **Rule-based classification**: High vs. Low risk stratification based on predicted day +90 log₂(EASIX)

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
3. **Clinical factors**: Select DRI, GVHD prophylaxis, or conditioning regimen to see stratified outcomes
4. **Compute**: Click "Compute & Classify" to generate results

### Interpretation

- **High Risk**: Predicted log₂(EASIX) ≥ 2.32 at day +90
- **Low Risk**: Predicted log₂(EASIX) < 2.32 at day +90
- **Insufficient Data**: Not enough valid data points to fit a regression model

## Technical Details

- **Framework**: React 19 with TypeScript
- **Styling**: Tailwind CSS
- **Visualization**: Custom chart components using SVG
- **Build tool**: Vite

## Disclaimers

This tool is intended for **research and educational purposes only**. It provides rule-based risk stratification, not individualized probability predictions. EASIX calculations can be affected by clinical factors like platelet transfusions and acute kidney injury. More time points generally yield more reliable slope estimates.

## License

This project is for research use. Please refer to the original manuscript for methodological details and clinical context.
