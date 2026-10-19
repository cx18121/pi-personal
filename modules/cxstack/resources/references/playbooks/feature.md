# Product and system design

Make the proposed experience concrete enough to judge before committing to an implementation shape. An agreed goal does not settle navigation, interaction, ownership, or what the user sees while work is happening. Use an example, flow, or sketch when it would expose a consequential misunderstanding more effectively than prose. When choosing between a durable implementation and a disposable artifact, use the [prototyping guidance](prototype.md).

Trace the existing system that serves the need. Prefer improving its capabilities and removing obsolete paths over creating a parallel setup. Keep different actors, data, states, and writers distinct, with a clear owner for each behavior.

Resolve user-owned choices before building around them. Choose routine engineering details yourself. Keep the agreed experience and relevant examples as the implementation's reference, rather than producing a second specification of the same decisions.

Judge the result through the experience the consumer will actually use. Verify important behavior and uncertainties with the evidence that can settle them. A working implementation can still be the wrong product.
