// This is compiled by rustc into a native shared library, not WebAssembly.
// Edit the cost function and save. The input model stays in the prepared host.
const FEATURE_BIAS: f64 = 0.0;
#[no_mangle]
pub extern "C" fn relive_abi() -> i32 { 1 }
#[no_mangle]
pub extern "C" fn edge_cost(length: f64, bend: f64, feature_weight: f64) -> f64 {
    length * (1.0 + FEATURE_BIAS * feature_weight * bend * bend)
}
