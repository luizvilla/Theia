/* SPDX-License-Identifier: LGPL-2.1 */
/**
 * Thin Pulsim C-Block ABI around a setup's unchanged control_step().
 *
 * The runner compiles this file beside src/control.cpp.  It contains no
 * controller or hardware policy: only ABI checks and type conversion.
 */
#include "control.h"

#include <new>

namespace {
struct Context {
    bool initialized = false;
};
}

extern "C" {

unsigned ownstudio_cblock_contract() { return 1; }
unsigned ownstudio_cblock_inputs() { return 7; }
unsigned ownstudio_cblock_outputs() { return 1; }

void *pulsim_cblock_init(int n_in, int n_out)
{
    if (n_in != 7 || n_out != 1) return nullptr;
    auto *context = new (std::nothrow) Context;
    if (context) {
        control_init(100.0e-6F);
        context->initialized = true;
    }
    return context;
}

void pulsim_cblock_term(void *state)
{
    delete static_cast<Context *>(state);
}

void pulsim_cblock_step(const double *in, int n_in, double *out, int n_out,
                        double, double, void **state)
{
    auto *context = state ? static_cast<Context *>(*state) : nullptr;
    if (!context || !context->initialized || !in || !out || n_in != 7 || n_out != 1) {
        if (out && n_out > 0) out[0] = 0.0;
        return;
    }
    const Measurements measurements = {
        static_cast<float>(in[1]), static_cast<float>(in[2]),
        static_cast<float>(in[3]), static_cast<float>(in[4]),
        static_cast<float>(in[5]), static_cast<float>(in[6]),
    };
    out[0] = static_cast<double>(control_step(static_cast<float>(in[0]), measurements));
}

}
