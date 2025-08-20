# Unified Completion System Fix

## Problem
The PromptInput component still has references to the old three-hook system that we replaced with the unified completion. We need to clean up all the old references.

## Solution
Replace all old suggestion rendering with a single unified block that handles all completion types.

## Changes Needed:

1. Remove all references to:
   - `agentSuggestions`
   - `pathSuggestions` 
   - `pathAutocompleteActive`
   - `selectedSuggestion` (replace with `selectedIndex`)
   - `selectedPathSuggestion`
   - `selectedAgentSuggestion`

2. Consolidate the three rendering blocks into one unified block

3. Update variable names to match the unified completion hook output