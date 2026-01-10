import * as React from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'
import { ApiKeyScreen } from '#ui-ink/ui/components/model-selector/screens/ApiKeyScreen'
import { BaseUrlScreen } from '#ui-ink/ui/components/model-selector/screens/BaseUrlScreen'
import { ConfirmationScreen } from '#ui-ink/ui/components/model-selector/screens/ConfirmationScreen'
import { ConnectionTestScreen } from '#ui-ink/ui/components/model-selector/screens/ConnectionTestScreen'
import { ContextLengthScreen } from '#ui-ink/ui/components/model-selector/screens/ContextLengthScreen'
import { ModelInputScreen } from '#ui-ink/ui/components/model-selector/screens/ModelInputScreen'
import { ModelParamsScreen } from '#ui-ink/ui/components/model-selector/screens/ModelParamsScreen'
import { ModelSelectionScreen } from '#ui-ink/ui/components/model-selector/screens/ModelSelectionScreen'
import { PartnerCodingPlansScreen } from '#ui-ink/ui/components/model-selector/screens/PartnerCodingPlansScreen'
import { PartnerProvidersScreen } from '#ui-ink/ui/components/model-selector/screens/PartnerProvidersScreen'
import { ProviderSelectionScreen } from '#ui-ink/ui/components/model-selector/screens/ProviderSelectionScreen'
import { ResourceNameScreen } from '#ui-ink/ui/components/model-selector/screens/ResourceNameScreen'
import type { Option, ModelSelectorViewProps } from './viewTypes'

export function ModelSelectorView(
  props: ModelSelectorViewProps,
): React.ReactNode {
  function getSafeVisibleOptionCount(
    requestedCount: number,
    optionLength: number,
    reservedLines: number = 10,
  ): number {
    const rows = props.terminalRows
    // Keep 1 spare line to avoid terminal scroll tearing when the UI is near full-height.
    const maxListLines = Math.max(1, rows - reservedLines - 1)

    const tentativeCount = Math.max(
      1,
      Math.min(requestedCount, optionLength, maxListLines),
    )

    // If we're going to truncate the list, we may render up to 2 extra lines for "More"
    // indicators (↑/↓). Reserve those lines when possible to avoid terminal scroll tearing.
    if (optionLength > tentativeCount) {
      const indicatorReserve = maxListLines >= 3 ? 2 : 0
      const availableForOptions = Math.max(1, maxListLines - indicatorReserve)
      return Math.max(
        1,
        Math.min(requestedCount, optionLength, availableForOptions),
      )
    }

    return tentativeCount
  }

  function renderWindowedOptions(
    options: Option[],
    focusedIndex: number,
    maxVisible: number,
  ) {
    if (options.length === 0) {
      return (
        <Text color={props.theme.secondaryText}>No options available.</Text>
      )
    }

    const visibleCount = Math.max(1, Math.min(maxVisible, options.length))
    const clampedFocus =
      options.length === 0
        ? 0
        : Math.max(0, Math.min(focusedIndex, options.length - 1))
    const half = Math.floor(visibleCount / 2)
    const start = Math.max(
      0,
      Math.min(clampedFocus - half, Math.max(0, options.length - visibleCount)),
    )
    const end = Math.min(options.length, start + visibleCount)
    const canShowIndicators = maxVisible >= 3
    const showUp = canShowIndicators && start > 0
    const showDown = canShowIndicators && end < options.length

    return (
      <Box flexDirection="column" gap={0}>
        {showUp && (
          <Text color={props.theme.secondaryText}>{figures.arrowUp} More</Text>
        )}
        {options.slice(start, end).map((opt, idx) => {
          const absoluteIndex = start + idx
          const isFocused = absoluteIndex === focusedIndex
          return (
            <Box key={opt.value} flexDirection="row">
              <Text
                color={isFocused ? props.theme.kode : props.theme.secondaryText}
              >
                {isFocused ? figures.pointer : ' '}
              </Text>
              <Text
                color={isFocused ? props.theme.text : props.theme.secondaryText}
                bold={isFocused}
              >
                {' '}
                {opt.label}
              </Text>
            </Box>
          )
        })}
        {showDown && (
          <Text color={props.theme.secondaryText}>
            {figures.arrowDown} More
          </Text>
        )}
      </Box>
    )
  }

  if (props.currentScreen === 'apiKey') {
    return (
      <ApiKeyScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalColumns={props.terminalColumns}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedProvider={props.selectedProvider}
        apiKey={props.apiKey}
        cursorOffset={props.cursorOffset}
        handleApiKeyChange={props.handleApiKeyChange}
        handleApiKeySubmit={props.handleApiKeySubmit}
        handleCursorOffsetChange={props.handleCursorOffsetChange}
        apiKeyCleanedNotification={props.apiKeyCleanedNotification}
        isLoadingModels={props.isLoadingModels}
        providerBaseUrl={props.providerBaseUrl}
        modelLoadError={props.modelLoadError}
        formatApiKeyDisplay={props.formatApiKeyDisplay}
        getProviderLabel={props.getProviderLabel}
      />
    )
  }

  if (props.currentScreen === 'model') {
    return (
      <ModelSelectionScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalRows={props.terminalRows}
        terminalColumns={props.terminalColumns}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedProvider={props.selectedProvider}
        availableModels={props.availableModels}
        modelSearchQuery={props.modelSearchQuery}
        modelSearchCursorOffset={props.modelSearchCursorOffset}
        handleModelSearchChange={props.handleModelSearchChange}
        handleModelSearchCursorOffsetChange={
          props.handleModelSearchCursorOffsetChange
        }
        modelOptions={props.modelOptions}
        handleModelSelection={props.handleModelSelection}
        getProviderLabel={props.getProviderLabel}
      />
    )
  }

  if (props.currentScreen === 'modelParams') {
    const formFields = props.getFormFieldsForModelParams()
    return (
      <ModelParamsScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalRows={props.terminalRows}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedModel={props.selectedModel}
        formFields={formFields}
        activeFieldIndex={props.activeFieldIndex}
        setActiveFieldIndex={props.setActiveFieldIndex}
        maxTokens={props.maxTokens}
        setMaxTokens={props.setMaxTokens}
        setSelectedMaxTokensPreset={props.setSelectedMaxTokensPreset}
        setMaxTokensCursorOffset={props.setMaxTokensCursorOffset}
        reasoningEffortOptions={props.reasoningEffortOptions}
        reasoningEffort={props.reasoningEffort}
        setReasoningEffort={props.setReasoningEffort}
        requestStrategyOptions={props.requestStrategyOptions}
        requestStrategy={props.requestStrategy}
        setRequestStrategy={props.setRequestStrategy}
      />
    )
  }

  if (props.currentScreen === 'resourceName') {
    return (
      <ResourceNameScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalColumns={props.terminalColumns}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        resourceName={props.resourceName}
        setResourceName={props.setResourceName}
        handleResourceNameSubmit={props.handleResourceNameSubmit}
        resourceNameCursorOffset={props.resourceNameCursorOffset}
        setResourceNameCursorOffset={props.setResourceNameCursorOffset}
      />
    )
  }

  if (props.currentScreen === 'baseUrl') {
    return (
      <BaseUrlScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalColumns={props.terminalColumns}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedProvider={props.selectedProvider}
        isLoadingModels={props.isLoadingModels}
        modelLoadError={props.modelLoadError}
        customBaseUrl={props.customBaseUrl}
        setCustomBaseUrl={props.setCustomBaseUrl}
        handleCustomBaseUrlSubmit={props.handleCustomBaseUrlSubmit}
        customBaseUrlCursorOffset={props.customBaseUrlCursorOffset}
        setCustomBaseUrlCursorOffset={props.setCustomBaseUrlCursorOffset}
        providerBaseUrl={props.providerBaseUrl}
        setProviderBaseUrl={props.setProviderBaseUrl}
        handleProviderBaseUrlSubmit={props.handleProviderBaseUrlSubmit}
        providerBaseUrlCursorOffset={props.providerBaseUrlCursorOffset}
        setProviderBaseUrlCursorOffset={props.setProviderBaseUrlCursorOffset}
      />
    )
  }

  if (props.currentScreen === 'modelInput') {
    return (
      <ModelInputScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalColumns={props.terminalColumns}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedProvider={props.selectedProvider}
        customModelName={props.customModelName}
        setCustomModelName={props.setCustomModelName}
        handleCustomModelSubmit={props.handleCustomModelSubmit}
        customModelNameCursorOffset={props.customModelNameCursorOffset}
        setCustomModelNameCursorOffset={props.setCustomModelNameCursorOffset}
      />
    )
  }

  if (props.currentScreen === 'contextLength') {
    return (
      <ContextLengthScreen
        theme={props.theme}
        exitState={props.exitState}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        contextLength={props.contextLength}
      />
    )
  }

  if (props.currentScreen === 'connectionTest') {
    return (
      <ConnectionTestScreen
        theme={props.theme}
        exitState={props.exitState}
        terminalColumns={props.terminalColumns}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedProvider={props.selectedProvider}
        getProviderLabel={props.getProviderLabel}
        isTestingConnection={props.isTestingConnection}
        connectionTestResult={props.connectionTestResult}
      />
    )
  }

  if (props.currentScreen === 'confirmation') {
    return (
      <ConfirmationScreen
        theme={props.theme}
        exitState={props.exitState}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        selectedProvider={props.selectedProvider}
        selectedModel={props.selectedModel}
        resourceName={props.resourceName}
        ollamaBaseUrl={props.ollamaBaseUrl}
        customBaseUrl={props.customBaseUrl}
        apiKey={props.apiKey}
        maxTokens={props.maxTokens}
        contextLength={props.contextLength}
        supportsReasoningEffort={props.supportsReasoningEffort}
        reasoningEffort={props.reasoningEffort}
        validationError={props.validationError}
        formatApiKeyDisplay={props.formatApiKeyDisplay}
        getProviderLabel={props.getProviderLabel}
      />
    )
  }

  if (props.currentScreen === 'partnerProviders') {
    return (
      <PartnerProvidersScreen
        theme={props.theme}
        exitState={props.exitState}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        compactLayout={props.compactLayout}
        tightLayout={props.tightLayout}
        partnerProviderOptions={props.partnerProviderOptions}
        partnerProviderFocusIndex={props.partnerProviderFocusIndex}
        partnerReservedLines={props.partnerReservedLines}
        getSafeVisibleOptionCount={getSafeVisibleOptionCount}
        renderWindowedOptions={renderWindowedOptions}
      />
    )
  }

  if (props.currentScreen === 'partnerCodingPlans') {
    return (
      <PartnerCodingPlansScreen
        theme={props.theme}
        exitState={props.exitState}
        containerPaddingY={props.containerPaddingY}
        containerGap={props.containerGap}
        tightLayout={props.tightLayout}
        compactLayout={props.compactLayout}
        codingPlanOptions={props.codingPlanOptions}
        codingPlanFocusIndex={props.codingPlanFocusIndex}
        codingReservedLines={props.codingReservedLines}
        getSafeVisibleOptionCount={getSafeVisibleOptionCount}
        renderWindowedOptions={renderWindowedOptions}
      />
    )
  }

  return (
    <ProviderSelectionScreen
      theme={props.theme}
      exitState={props.exitState}
      containerPaddingY={props.containerPaddingY}
      containerGap={props.containerGap}
      compactLayout={props.compactLayout}
      tightLayout={props.tightLayout}
      mainMenuOptions={props.mainMenuOptions}
      providerFocusIndex={props.providerFocusIndex}
      providerReservedLines={props.providerReservedLines}
      getSafeVisibleOptionCount={getSafeVisibleOptionCount}
      renderWindowedOptions={renderWindowedOptions}
    />
  )
}
