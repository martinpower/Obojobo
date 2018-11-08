import React from 'react'
import { mount } from 'enzyme'
import renderer from 'react-test-renderer'

import IFrame from '../../../../ObojoboDraft/Chunks/IFrame/editor'
const IFRAME_NODE = 'ObojoboDraft.Chunks.IFrame'

describe('IFrame editor', () => {
	test('Node component', () => {
		const Node = IFrame.components.Node
		const component = renderer.create(
			<Node
				node={{
					data: {
						get: () => {
							return {}
						}
					}
				}}
			/>
		)
		const tree = component.toJSON()

		expect(tree).toMatchSnapshot()
	})

	test('Node component changes input', () => {
		const Node = IFrame.components.Node

		const change = {
			setNodeByKey: jest.fn()
		}

		const component = mount(
			<Node
				node={{
					data: {
						get: () => {
							return {}
						}
					}
				}}
				isFocused={true}
				isSelected={true}
				editor={{
					value: { change: () => change },
					onChange: jest.fn()
				}}
			/>
		)
		const tree = component.html()

		component.find('input').simulate('click', {
			stopPropagation: () => true
		})

		component.find('input').simulate('change', {
			target: { value: 'mockInput' }
		})

		expect(tree).toMatchSnapshot()
	})

	test('insertNode calls change methods', () => {
		const change = {}
		change.insertBlock = jest.fn().mockReturnValueOnce(change)
		change.focus = jest.fn().mockReturnValueOnce(change)

		IFrame.helpers.insertNode(change)

		expect(change.insertBlock).toHaveBeenCalled()
		expect(change.focus).toHaveBeenCalled()
	})

	test('slateToObo converts a Slate node to an OboNode with content', () => {
		const slateNode = {
			key: 'mockKey',
			type: 'mockType',
			data: {
				get: () => null
			},
			text: 'mockText'
		}
		const oboNode = IFrame.helpers.slateToObo(slateNode)

		expect(oboNode).toMatchSnapshot()
	})

	test('oboToSlate converts an OboNode to a Slate node', () => {
		const oboNode = {
			id: 'mockKey',
			type: 'mockType',
			content: { width: 'large' }
		}
		const slateNode = IFrame.helpers.oboToSlate(oboNode)

		expect(slateNode).toMatchSnapshot()
	})

	test('oboToSlate converts an OboNode to a Slate node with a caption', () => {
		const oboNode = {
			id: 'mockKey',
			type: 'mockType',
			content: {}
		}
		const slateNode = IFrame.helpers.oboToSlate(oboNode)

		expect(slateNode).toMatchSnapshot()
	})

	test('plugins.renderNode renders a button when passed', () => {
		const props = {
			attributes: { dummy: 'dummyData' },
			node: {
				type: IFRAME_NODE,
				data: {
					get: () => {
						return {}
					}
				}
			}
		}

		expect(IFrame.plugins.renderNode(props)).toMatchSnapshot()
	})
})
