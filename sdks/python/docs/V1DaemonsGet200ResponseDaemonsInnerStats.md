# V1DaemonsGet200ResponseDaemonsInnerStats


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**total_invocations** | **int** |  | 
**last_invoked_at** | **datetime** |  | [optional] 
**avg_duration_ms** | **int** |  | [optional] 

## Example

```python
from paws_client.models.v1_daemons_get200_response_daemons_inner_stats import V1DaemonsGet200ResponseDaemonsInnerStats

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsGet200ResponseDaemonsInnerStats from a JSON string
v1_daemons_get200_response_daemons_inner_stats_instance = V1DaemonsGet200ResponseDaemonsInnerStats.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsGet200ResponseDaemonsInnerStats.to_json())

# convert the object into a dict
v1_daemons_get200_response_daemons_inner_stats_dict = v1_daemons_get200_response_daemons_inner_stats_instance.to_dict()
# create an instance of V1DaemonsGet200ResponseDaemonsInnerStats from a dict
v1_daemons_get200_response_daemons_inner_stats_from_dict = V1DaemonsGet200ResponseDaemonsInnerStats.from_dict(v1_daemons_get200_response_daemons_inner_stats_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


