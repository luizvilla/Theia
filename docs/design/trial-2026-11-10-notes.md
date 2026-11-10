# OwnStudio trial, 2026-11-10

One line per remark: where (workbench, panel), what happened, what you expected.
Mark each: **bug** (broken), **friction** (works, but awkward), **missing**, **idea**, **good**.

## As a student (the Mission steps panel, steps 1 to 5)

## Home

When I click on mission steps and then on open, nothing happens. I'm not taken to where I'm supposed to go. 

![using Home](image1.png)

--end remark

## Design

**friction**
The size of the output filter just gives me code. What am I supposed to do with it? how does it run?
this is unusable by anyone. 

Sizing a filter would require a dedicated simple gui that would show the impact of hte choices (ripple and etc.)

![alt text](image2.png)
--- end remark

## Code (and the AI, if a key is set)

This is the worse part

![view of the code](image-1.png)

In vscode there are multiple built-in features such as coloring the code, snippets. Control+click to follow the code. 
all of this is missin here. 

Futhremore, the side explorer just shows toomuch. I do not know what is relative to teh code and what is relative to other stuff. the names are not clear. 

The example is too complex

## Lab, control center, procedures

the lab identifies that the board has the cdoe

testing on the board looks interesting

![alt text](image-4.png)

here's the result on a spin, so no power can be seen and the estes fails

![alt text](image-5.png)

When flashing, there is no progress bar, just a bar that moves back and forth
![alt text](image-3.png)

When I press on run the simulation, I just get a log. There is no progress bar on the simulation. It does say running, but that is not enough 
![alt text](image.png)


I then get the result afeter some time

![result](image-2.png)

But I don't see the step. The result is an image I cannot interact with. it says pass, but the running is not really clear on what the mission is

## Overall: what should OwnStudio be better at, first?

overall it is really cumbersmoeto use 

I see a big problem: the 5 blocks should be something that all the different parts touch, but it dissapears once you leave the home

the side icons should be the ones representing the different workstations rather than being on the bottom. 
it is nice to have something on the right hand side, but this is poorly exploited by the current code


 The top of the window should also have a simiarl green color rather than dark gray

 when we click on any of teh blocks, that sends us to code. this is not ok

 the ownstudio should be way more visual. 

 I think there should be a bottom pane with the different parts of the system (input, converter and output) with the converter being something that we can then click inside and specify stuff. 
 the interaction between the parts and this bottom windows should be seamless as well. 

 I think we could have a sort of drag and drop twist board, maybe ont he right hand side as with a hardware icon, we drag and drop it on the bottom pit. then we can drag and drop a source or a load (resistor at first) these can be connected together and then the parameters are fed into them images

 I want you to roast me on this new approach. 

 the ai should link to an account and not a key

 the outline does not work 
 