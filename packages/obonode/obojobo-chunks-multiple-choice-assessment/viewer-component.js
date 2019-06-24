import './viewer-component.scss'

import { CSSTransition } from 'react-transition-group'
import Common from 'obojobo-document-engine/src/scripts/common'
import MCAssessmentAnswerChoices from './mc-assessment-answer-choices'
import MCAssessmentExplanation from './mc-assessment-explanation'
import MCAssessmentSubmitAndResultsFooter from './mc-assessment-submit-and-results-footer'
import React from 'react'
import Viewer from 'obojobo-document-engine/src/scripts/viewer'
import _ from 'underscore'
import isOrNot from 'obojobo-document-engine/src/scripts/common/util/isornot'

const { Dispatcher } = Common.flux
const { OboModel } = Common.models
const { DOMUtil } = Common.page
const { OboComponent } = Viewer.components
const { FocusUtil, QuestionUtil } = Viewer.util

const DEFAULT_CORRECT_PRACTICE_LABELS = ['Correct!', 'You got it!', 'Great job!', "That's right!"]
const DEFAULT_CORRECT_REVIEW_LABELS = ['Correct']
const DEFAULT_INCORRECT_LABELS = ['Incorrect']
const DEFAULT_INCORRECT_REVIEW_LABELS = ['Incorrect']
const DEFAULT_SURVEY_LABELS = ['Response recorded']
const DEFAULT_SURVEY_REVIEW_LABELS = ['Response recorded']
const DEFAULT_SURVEY_UNANSWERED_LABELS = ['No response given']
const PICK_ALL_INCORRECT_MESSAGE =
	'You have either missed some correct answers or selected some incorrect answers.'

const ANIMATION_TRANSITION_TIME_MS = 800

const FOCUS_TARGET_EXPLANATION = 'explanation'
const FOCUS_TARGET_RESULTS = 'results'
const FOCUS_TARGET_QUESTION = 'question'

export default class MCAssessment extends React.Component {
	constructor(props) {
		super(props)
		this.answerChoicesRef = React.createRef()
		const { correctLabels, incorrectLabels } = this.props.model.modelState

		this.onClickShowExplanation = this.onClickShowExplanation.bind(this)
		this.onClickHideExplanation = this.onClickHideExplanation.bind(this)
		this.onClickReset = this.onClickReset.bind(this)
		this.onFormChange = this.onFormChange.bind(this)
		this.onFormSubmit = this.onFormSubmit.bind(this)
		this.onCheckAnswer = this.onCheckAnswer.bind(this)
		this.isShowingExplanation = this.isShowingExplanation.bind(this)

		const isReview = this.props.mode === 'review'
		const isSurvey = this.props.type === 'survey'
		const isAnswered = this.getResponseData().responses.size >= 1 // An answer choice was selected

		this.correctLabels = this.getCorrectLabels(correctLabels, isReview, isSurvey, isAnswered)
		this.incorrectLabels = this.getIncorrectLabels(incorrectLabels, isReview)

		this.updateFeedbackLabels()
		this.sortIds()
	}

	getCorrectLabels(correctLabels, isReview, isSurvey, isAnswered) {
		if (correctLabels) {
			return correctLabels
		}

		if (isReview && isSurvey && isAnswered) {
			return DEFAULT_SURVEY_REVIEW_LABELS
		}

		if (isReview && isSurvey && !isAnswered) {
			return DEFAULT_SURVEY_UNANSWERED_LABELS
		}

		if (isReview && !isSurvey) {
			return DEFAULT_CORRECT_REVIEW_LABELS
		}

		if (isSurvey) {
			return DEFAULT_SURVEY_LABELS
		}

		return DEFAULT_CORRECT_PRACTICE_LABELS
	}

	getIncorrectLabels(incorrectLabels, isReview) {
		if (incorrectLabels) {
			return incorrectLabels
		}

		if (isReview) {
			return DEFAULT_INCORRECT_REVIEW_LABELS
		}

		return DEFAULT_INCORRECT_LABELS
	}

	getQuestionModel() {
		return this.props.model.getParentOfType('ObojoboDraft.Chunks.Question')
	}

	getResponseData() {
		const questionResponse = QuestionUtil.getResponse(
			this.props.moduleData.questionState,
			this.getQuestionModel(),
			this.props.moduleData.navState.context
		) || { ids: [] }

		const correct = new Set()
		const responses = new Set()
		let childId

		for (const child of Array.from(this.props.model.children.models)) {
			childId = child.get('id')

			if (child.modelState.score === 100) {
				correct.add(childId)
			}

			if (questionResponse.ids.indexOf(childId) !== -1) {
				responses.add(childId)
			}
		}

		return {
			correct,
			responses
		}
	}

	calculateScore() {
		const responseData = this.getResponseData()
		const { correct } = responseData
		const { responses } = responseData

		const questionModel = this.getQuestionModel()

		if (questionModel.modelState.type === 'survey') {
			return 'no-score'
		}

		switch (this.props.model.modelState.responseType) {
			case 'pick-all': {
				if (correct.size !== responses.size) {
					return 0
				}
				let score = 100
				correct.forEach(function(id) {
					if (!responses.has(id)) {
						return (score = 0)
					}
				})
				return score
			}

			default:
				// pick-one | pick-one-multiple-correct
				for (const id of Array.from(Array.from(correct))) {
					if (responses.has(id)) {
						return 100
					}
				}

				return 0
		}
	}

	retry() {
		QuestionUtil.retryQuestion(
			this.getQuestionModel().get('id'),
			this.props.moduleData.navState.context
		)
	}

	hideExplanation() {
		QuestionUtil.hideExplanation(
			this.getQuestionModel().get('id'),
			this.props.moduleData.navState.context,
			'user'
		)
	}

	onClickReset(event) {
		event.preventDefault()

		this.nextFocus = FOCUS_TARGET_QUESTION

		this.retry()
	}

	onClickShowExplanation(event) {
		event.preventDefault()

		this.nextFocus = FOCUS_TARGET_EXPLANATION

		QuestionUtil.showExplanation(
			this.getQuestionModel().get('id'),
			this.props.moduleData.navState.context
		)
	}

	onClickHideExplanation(event) {
		event.preventDefault()

		this.hideExplanation()
	}

	onFormChange(event) {
		let response
		const questionModel = this.getQuestionModel()
		const mcChoiceEl = DOMUtil.findParentWithAttr(
			event.target,
			'data-type',
			'ObojoboDraft.Chunks.MCAssessment.MCChoice'
		)
		if (!mcChoiceEl) {
			return
		}

		const mcChoiceId = mcChoiceEl.getAttribute('data-id')
		if (!mcChoiceId) {
			return
		}

		if (this.getScore() !== null) {
			this.retry()
		}

		switch (this.props.model.modelState.responseType) {
			case 'pick-all': {
				response = QuestionUtil.getResponse(
					this.props.moduleData.questionState,
					questionModel,
					this.props.moduleData.navState.context
				) || {
					ids: []
				}
				const responseIndex = response.ids.indexOf(mcChoiceId)

				if (responseIndex === -1) {
					response.ids.push(mcChoiceId)
				} else {
					response.ids.splice(responseIndex, 1)
				}

				break
			}

			default:
				response = {
					ids: [mcChoiceId]
				}
				break
		}

		this.nextFocus = FOCUS_TARGET_RESULTS

		QuestionUtil.setResponse(
			questionModel.get('id'),
			response,
			mcChoiceId,
			this.props.moduleData.navState.context,
			this.props.moduleData.navState.context.split(':')[1],
			this.props.moduleData.navState.context.split(':')[2]
		)
	}

	onFormSubmit(event) {
		event.preventDefault()

		const questionModel = this.getQuestionModel()

		QuestionUtil.setScore(
			questionModel.get('id'),
			this.calculateScore(),
			this.props.moduleData.navState.context
		)

		this.updateFeedbackLabels()

		if (questionModel.modelState.type === 'survey') {
			QuestionUtil.submitResponse(questionModel.get('id'), this.props.moduleData.navState.context)
		} else {
			QuestionUtil.checkAnswer(questionModel.get('id'), this.props.moduleData.navState.context)
		}
	}

	getScore() {
		return QuestionUtil.getScoreForModel(
			this.props.moduleData.questionState,
			this.getQuestionModel(),
			this.props.moduleData.navState.context
		)
	}

	componentDidMount() {
		Dispatcher.on('question:checkAnswer', this.onCheckAnswer)
	}

	componentDidUpdate() {
		this.sortIds()

		switch (this.nextFocus) {
			case FOCUS_TARGET_EXPLANATION:
				delete this.nextFocus
				this.refExplanation.focusOnExplanation()
				break

			case FOCUS_TARGET_RESULTS:
				if (this.getScore() !== null) {
					delete this.nextFocus
					this.answerChoicesRef.current.focusOnResults()
				}
				break

			case FOCUS_TARGET_QUESTION:
				delete this.nextFocus
				FocusUtil.focusComponent(this.getQuestionModel().get('id'))
				break
		}
	}

	componentWillUnmount() {
		Dispatcher.off('question:checkAnswer', this.onCheckAnswer)
	}

	onCheckAnswer(payload) {
		const questionId = this.getQuestionModel().get('id')

		if (payload.value.id === questionId) {
			QuestionUtil.setScore(
				questionId,
				this.calculateScore(),
				this.props.moduleData.navState.context
			)
		}
	}

	updateFeedbackLabels() {
		this.correctLabelToShow = this.getRandomItem(this.correctLabels)
		this.incorrectLabelToShow = this.getRandomItem(this.incorrectLabels)
	}

	getRandomItem(arrayOfOptions) {
		return arrayOfOptions[Math.floor(Math.random() * arrayOfOptions.length)]
	}

	sortIds() {
		if (!this.getSortedIds()) {
			let ids = this.props.model.children.models.map(model => model.get('id'))
			if (this.props.model.modelState.shuffle) ids = _.shuffle(ids)
			QuestionUtil.setData(
				this.props.model.get('id'),
				this.props.moduleData.navState.context,
				'sortedIds',
				ids
			)
		}
	}

	getSortedIds() {
		return QuestionUtil.getData(
			this.props.moduleData.questionState,
			this.props.model,
			this.props.moduleData.navState.context,
			'sortedIds'
		)
	}

	getSortedChoiceModels() {
		const sortedIds = this.getSortedIds()
		if (!sortedIds) return []

		return sortedIds
			.map(mcChoiceId => OboModel.models[mcChoiceId])
			.filter(model => model.get('type') === 'ObojoboDraft.Chunks.MCAssessment.MCChoice')
	}

	isShowingExplanationButton() {
		const isAnswerScored = this.getScore() !== null
		const hasSolution = this.props.model.parent.modelState.solution !== null
		const isSurvey = this.props.type === 'survey'

		return isAnswerScored && hasSolution && !isSurvey
	}

	isShowingExplanation() {
		return QuestionUtil.isShowingExplanation(
			this.props.moduleData.questionState,
			this.getQuestionModel(),
			this.props.moduleData.navState.context
		)
	}

	getInstructions(responseType, questionType) {
		if (questionType === 'survey') {
			switch (responseType) {
				case 'pick-one':
				case 'pick-one-multiple-correct':
					return <span>Choose one</span>
				case 'pick-all':
					return <span>Choose one or more</span>
			}
		} else {
			switch (responseType) {
				case 'pick-one':
					return <span>Pick the correct answer</span>
				case 'pick-one-multiple-correct':
					return <span>Pick one of the correct answers</span>
				case 'pick-all':
					return (
						<span>
							Pick <b>all</b> of the correct answers
						</span>
					)
			}
		}
	}

	animationOnEntered() {
		this.solutionContainerHeight = `${this.solutionContainerRef.getBoundingClientRect().height}px`
	}

	animationOnExit(el) {
		el.style.height = this.solutionContainerHeight
	}

	animationOnExiting(el) {
		el.style.height = 0
	}

	render() {
		const responseType = this.props.model.modelState.responseType
		const isTypePickAll = responseType === 'pick-all'
		const isShowingExplanationValue = this.isShowingExplanation()
		const isShowingExplanationButtonValue = this.isShowingExplanationButton()
		const score = this.getScore()
		const sortedChoiceModels = this.getSortedChoiceModels()
		const isAnswered = this.getResponseData().responses.size >= 1 // An answer choice was selected
		const isReview = this.props.mode === 'review'
		const isAssessmentQuestion = this.props.mode === 'assessment'

		const className =
			'obojobo-draft--chunks--mc-assessment' +
			` is-response-type-${this.props.model.modelState.responseType}` +
			` is-mode-${this.props.mode}` +
			` is-type-${this.props.type}` +
			isOrNot(isAnswered, 'answered') +
			isOrNot(score === 100, 'correct') +
			isOrNot(isShowingExplanationValue, 'showing-explanation') +
			isOrNot(score !== null, 'scored')

		return (
			<OboComponent
				model={this.props.model}
				moduleData={this.props.moduleData}
				onChange={!isReview ? this.onFormChange : null}
				onSubmit={this.onFormSubmit}
				tag="form"
				className={className}
			>
				<fieldset>
					<legend className="instructions">
						<span className="for-screen-reader-only">{`Multiple choice form with ${
							sortedChoiceModels.length
						} choices. `}</span>
						{this.getInstructions(responseType, this.props.type)}
					</legend>
					<MCAssessmentAnswerChoices
						ref={this.answerChoicesRef}
						models={sortedChoiceModels}
						responseType={responseType}
						score={score}
						mode={this.props.mode}
						type={this.props.type}
						moduleData={this.props.moduleData}
						correctLabel={this.correctLabelToShow}
						incorrectLabel={this.incorrectLabelToShow}
						pickAllIncorrectMessage={PICK_ALL_INCORRECT_MESSAGE}
					/>
					{!isAssessmentQuestion ? (
						<MCAssessmentSubmitAndResultsFooter
							score={score}
							isAnswered={isAnswered}
							mode={this.props.mode}
							type={this.props.type}
							isTypePickAll={isTypePickAll}
							correctLabel={this.correctLabelToShow}
							incorrectLabel={this.incorrectLabelToShow}
							pickAllIncorrectMessage={PICK_ALL_INCORRECT_MESSAGE}
							onClickReset={this.onClickReset}
						/>
					) : null}
					<CSSTransition
						in={isShowingExplanationButtonValue}
						classNames="submit"
						timeout={ANIMATION_TRANSITION_TIME_MS}
					>
						{isShowingExplanationButtonValue ? (
							<MCAssessmentExplanation
								ref={component => (this.refExplanation = component)}
								isShowingExplanation={isShowingExplanationValue}
								solutionModel={this.props.model.parent.modelState.solution}
								moduleData={this.props.moduleData}
								animationTransitionTime={ANIMATION_TRANSITION_TIME_MS}
								animationOnEntered={this.animationOnEntered}
								animationOnExit={this.animationOnExit}
								animationOnExiting={this.animationOnExiting}
								onClickShowExplanation={this.onClickShowExplanation}
								onClickHideExplanation={this.onClickHideExplanation}
							/>
						) : (
							<span />
						)}
					</CSSTransition>
				</fieldset>
			</OboComponent>
		)
	}
}
